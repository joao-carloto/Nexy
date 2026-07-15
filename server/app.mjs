import fs from 'fs';
import process from 'process';
import express from 'express';
import sqlite3 from 'sqlite3';
import path from 'path';
import multer from 'multer';
import crypto from 'crypto';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { encode } from 'html-entities';
import { createAIPost, createHumanPost, createPsyopPost } from './post_creator.js';
import { createCommentText, createCommentReply } from './text_creator.js';
import { getPostTextFromDB, getRandomUserIdFromDB } from './utils.js';
import { createUserImage } from './image_creator.js';

dotenv.config();
const app = express();
const dbPath = path.join(path.resolve(), 'server/data/nexyDB.sqlite');
const uploadsRoot = path.join(path.resolve(), 'server/data/uploads');
const postImagesDir = path.join(uploadsRoot, 'post_images');
const profilePicturesDir = path.join(uploadsRoot, 'profile_pictures');
const postThumbnailsDir = path.join(uploadsRoot, 'thumbnails/post_images');
const profileThumbnailsDir = path.join(uploadsRoot, 'thumbnails/profile_pictures');
// Quarantine dir for raw uploads: NOT mounted as static, so an uploaded file is never
// web-accessible until it has been validated and processed into postImagesDir.
const tempUploadsDir = path.join(uploadsRoot, 'tmp_uploads');

// Reserved userId that a deleted bot's posts/comments get reassigned to (see
// DELETE /bots/:userId), so the feed never shows content with a dangling author.
const DELETED_USER_ID = 'deleted_user';

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Database opened successfully');
  }
});

// Middleware to parse JSON bodies
app.use(express.json());

// Rate limiter for routes that trigger paid OpenAI calls, to bound API cost/abuse
// from anonymous callers (these routes have no auth requirement by design).
const aiGenerationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many generation requests. Please try again later.' },
});

// Simple cookie parser (no external dependency)
function parseCookies(header) {
  const list = {};
  if (!header) return list;
  header.split(';').forEach((cookie) => {
    const parts = cookie.split('=');
    const key = parts.shift()?.trim();
    if (!key) return;
    list[key] = decodeURIComponent(parts.join('=').trim());
  });
  return list;
}

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
// Never fall back to a fixed, publicly-known secret: generate a random one per
// process start if .env doesn't provide one. This means existing admin sessions
// won't survive a restart, but a leaked/guessed secret is no longer possible.
let ADMIN_TOKEN_SECRET = process.env.ADMIN_TOKEN_SECRET;
if (!ADMIN_TOKEN_SECRET) {
  ADMIN_TOKEN_SECRET = crypto.randomBytes(32).toString('hex');
  console.warn(
    'ADMIN_TOKEN_SECRET not set in .env; generated a random secret for this run. ' +
      'Admin sessions will not survive a server restart. Set ADMIN_TOKEN_SECRET in .env to avoid this.'
  );
}

const ADMIN_SESSION_TTL_SECONDS = 60 * 60; // also used as the cookie's Max-Age

function signAdminPayload(issuedAt) {
  return crypto.createHmac('sha256', ADMIN_TOKEN_SECRET).update(`${ADMIN_PASSWORD}.${issuedAt}`).digest('hex');
}

function generateAdminToken() {
  // Token embeds its own issuance time so expiry can be enforced server-side,
  // instead of relying solely on the client-controlled cookie Max-Age.
  const issuedAt = Date.now().toString();
  return `${issuedAt}.${signAdminPayload(issuedAt)}`;
}

function isAdmin(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies.adminAuth;
  if (!token || !ADMIN_PASSWORD) return false;

  const [issuedAt, signature] = token.split('.');
  if (!issuedAt || !signature) return false;

  const issuedAtMs = Number(issuedAt);
  if (!Number.isFinite(issuedAtMs)) return false;
  if (Date.now() - issuedAtMs > ADMIN_SESSION_TTL_SECONDS * 1000) return false;

  const expected = Buffer.from(signAdminPayload(issuedAt));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

// Middleware to protect admin pages
function requireAdminPage(req, res, next) {
  if (!isAdmin(req)) {
    return res.redirect('/login.html');
  }
  next();
}

// Route: protected admin page.
// Used by: redirect target after successful login in public/js/login.js.
app.get('/manage_posts.html', requireAdminPage, (req, res) => {
  // Serve the file explicitly (bypass redirect loop)
  const filePath = path.join(path.resolve(), 'public', 'html', 'manage_posts.html');
  res.sendFile(filePath);
});

// Route: protected admin page.
// Used by: direct navigation from admin workflow to manage bots UI.
app.get('/manage_bots.html', requireAdminPage, (req, res) => {
  const filePath = path.join(path.resolve(), 'public', 'html', 'manage_bots.html');
  res.sendFile(filePath);
});

// Limits password-guessing attempts against /login. Counts failed and successful
// attempts alike (deliberately not skipSuccessfulRequests) to bound total guesses per IP.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
});

// Route: admin authentication API.
// Used by: login form submit in public/js/login.js.
app.post('/login', loginLimiter, (req, res) => {
  const { password } = req.body || {};
  if (!ADMIN_PASSWORD) {
    return res.status(500).json({ error: 'Admin password not configured on server' });
  }
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  const token = generateAdminToken();
  // Set HttpOnly cookie (no secure flag since may be served over http locally)
  res.setHeader(
    'Set-Cookie',
    `adminAuth=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${ADMIN_SESSION_TTL_SECONDS}`
  );
  res.json({ ok: true });
});

// Route: admin logout API.
// Used by: Logout link in the admin menu (public/js/title.js) and manual navigation to /logout.
app.get('/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'adminAuth=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
  res.redirect('/login.html');
});

// Route: admin session status check.
// Used by: admin menu in public/js/title.js, to show Login vs Logout since adminAuth
// is an HttpOnly cookie and can't be read directly by client-side JS.
app.get('/admin/status', (req, res) => {
  res.json({ authenticated: isAdmin(req) });
});

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Limits contact form submissions per IP to bound spam/abuse from anonymous callers.
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many messages sent. Please try again later.' },
});

// Route: reports whether the contact form is usable, so the client can hide it
// (keeping only the GitHub/LinkedIn links) on installations that haven't set up Resend.
// Used by: public/js/title.js, to toggle the contact form in title.html.
app.get('/contact/status', (req, res) => {
  const available = Boolean(process.env.RESEND_API_KEY && process.env.CONTACT_TO_EMAIL && process.env.CONTACT_FROM_EMAIL);
  res.json({ available });
});

// Route: contact form submission, relayed by email via Resend.
// Used by: contact form in public/html/help_popup_content.html (public/js/title.js).
// Keeps the maintainer's real address out of the page source.
app.post('/contact', contactLimiter, async (req, res) => {
  const { name, email, message } = req.body || {};
  if (!name || typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'Name is required' });
  }
  if (!email || typeof email !== 'string' || !EMAIL_PATTERN.test(email.trim())) {
    return res.status(400).json({ error: 'A valid email is required' });
  }
  if (!message || typeof message !== 'string' || message.trim() === '') {
    return res.status(400).json({ error: 'Message is required' });
  }
  if (name.length > 100 || email.length > 200 || message.length > 5000) {
    return res.status(400).json({ error: 'Input exceeds maximum length' });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const contactToEmail = process.env.CONTACT_TO_EMAIL;
  if (!resendApiKey || !contactToEmail) {
    console.error('Contact form submitted but RESEND_API_KEY / CONTACT_TO_EMAIL is not configured');
    return res.status(500).json({ error: 'Contact form is not configured on the server' });
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.CONTACT_FROM_EMAIL || 'Nexy Contact Form <onboarding@resend.dev>',
        to: contactToEmail,
        reply_to: email.trim(),
        subject: `Nexy contact form: ${name.trim()}`,
        text: `Name: ${name.trim()}\nEmail: ${email.trim()}\n\n${message.trim()}`,
      }),
    });
    if (!response.ok) {
      const errBody = await response.text();
      console.error('Resend API error:', response.status, errBody);
      return res.status(502).json({ error: 'Failed to send message' });
    }
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Error sending contact form email:', error);
    res.status(502).json({ error: 'Failed to send message' });
  }
});

// Route: root redirect.
// Used by: first page load for the app (sends users to explore feed).
app.get('/', (req, res) => {
  res.redirect('/explore.html');
});
// Static route: serves shared assets and top-level HTML pages in public/.
app.use(express.static(path.join(path.resolve(), 'public')));
// Static route: supports direct page URLs like /explore.html and /post.html.
app.use(express.static(path.join(path.resolve(), 'public', 'html')));

// Static route: serves uploaded post images referenced by posts.
app.use('/post_images', express.static(postImagesDir));

// Static route: serves uploaded profile pictures referenced by users/comments.
app.use('/profile_pictures', express.static(profilePicturesDir));

// Static route: serves generated post thumbnails for feed/cards.
app.use('/thumbnails/post_images', express.static(postThumbnailsDir));

// Static route: serves generated profile thumbnails for avatars.
app.use('/thumbnails/profile_pictures', express.static(profileThumbnailsDir));

// Set up multer for image uploads. Files land in a private quarantine directory
// (not statically served) and are only moved into postImagesDir after createHumanPost
// validates and processes them.
const ALLOWED_UPLOAD_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync(tempUploadsDir, { recursive: true });
    cb(null, tempUploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).slice(0, 10)}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    // Content-Type is client-supplied and can be spoofed; this is a cheap first filter.
    // The real check is the sharp()-based image validation in createHumanPost, which
    // reads actual file bytes before the upload is used for anything.
    if (!ALLOWED_UPLOAD_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error('Only JPEG, PNG, or WEBP images are allowed.'));
    }
    cb(null, true);
  },
});

// Wraps upload.single('image') so multer/file-filter errors return a clean 400
// instead of falling through to Express's default HTML error page.
function handleImageUpload(req, res, next) {
  upload.single('image')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message || 'Failed to process uploaded file' });
    }
    next();
  });
}

// Initialize database tables
db.serialize(() => {
  // Final schema (migrations removed on 2025-08-28)
  db.run(`CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    postText TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    countryCode TEXT,
    languageCode TEXT,
    sourceType TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS comments (
    commentId INTEGER PRIMARY KEY AUTOINCREMENT,
    postId TEXT NOT NULL,
    userId TEXT NOT NULL,
    commentText TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    sourceType TEXT,
    FOREIGN KEY (postId) REFERENCES posts(id)
  )`);
  db.run('CREATE INDEX IF NOT EXISTS idx_comments_postId ON comments(postId)');

  db.run(`CREATE TABLE IF NOT EXISTS users (
    userId TEXT PRIMARY KEY,
    fullName TEXT NOT NULL,
    profilePictureName TEXT,
    description TEXT,
    countryRegion TEXT
  )`);

  // Reserved placeholder author: posts/comments from a deleted bot are reassigned
  // here (see DELETE /bots/:userId) instead of being left pointing at a userId
  // that no longer exists in this table.
  db.run(
    `INSERT OR IGNORE INTO users (userId, fullName, profilePictureName, description, countryRegion)
     VALUES (?, 'Deleted User', NULL, 'This account has been deleted.', NULL)`,
    [DELETED_USER_ID]
  );
});
// Route: create AI-generated post.
// Used by: bot post creator page in public/js/new_bot_post.js.
app.post('/create_bot_post', aiGenerationLimiter, async (req, res) => {
  let { topic, isFakeNews, numComments, locale } = req.body;
  // All fields are optional
  if (typeof topic !== 'string') topic = '';
  if (typeof isFakeNews === 'undefined') isFakeNews = false;
  // If numComments is not set or invalid, pick a random number between 1 and 5
  if (typeof numComments === 'undefined' || isNaN(Number(numComments))) {
    numComments = Math.floor(Math.random() * 5) + 1;
  }
  console.log('/create_bot_post received:', { topic, isFakeNews, numComments, locale });
  try {
    const postId = await createAIPost({
      topic,
      isFakeNews,
      numComments,
      locale,
    });
    res.status(201).json({ postId });
  } catch (error) {
    console.error('Error generating bot post:', error);
    res.status(500).json({
      error: error.message || String(error) || 'Failed to generate bot post',
    });
  }
});

// Route: create PsyOp post.
// Used by: psyop generator page in public/js/psyop.js.
app.post('/create_psyop_post', aiGenerationLimiter, async (req, res) => {
  let { objective, target, strategy } = req.body;
  if (!objective || typeof objective !== 'string' || objective.trim() === '') {
    return res.status(400).json({ error: 'objective is required' });
  }
  if (!target || typeof target !== 'string') target = 'general public';
  if (!['White', 'Grey', 'Black'].includes(strategy)) strategy = 'White';
  console.log('/create_psyop_post received:', { objective, target, strategy });
  try {
    const postId = await createPsyopPost({ objective: objective.trim(), target: target.trim(), strategy });
    res.status(201).json({ postId });
  } catch (error) {
    console.error('Error generating psyop post:', error);
    res.status(500).json({ error: error.message || 'Failed to generate psyop post' });
  }
});

// Route: create human-authored post (supports optional uploaded image).
// Used by: human post composer in public/js/new_human_post.js.
app.post('/create_human_post', aiGenerationLimiter, handleImageUpload, async (req, res) => {
  const { userId, postText, locale } = req.body;
  const originalImageFileName = req.file ? req.file.filename : null;
  try {
    // Validate postText length
    if (!postText || postText.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Post text is required' });
    }
    if (postText.length > 500) {
      return res.status(400).json({ success: false, error: 'Post text exceeds maximum length of 500 characters' });
    }
    // Call the createHumanPost function, passing locale so text generation can be language-aware.
    const result = await createHumanPost(userId, postText, originalImageFileName, locale);

    // Send a success response back to the client
    res.status(200).json({ success: true, postId: result.postId });
  } catch (error) {
    console.error('Error creating human post:', error.message);

    // Send an error response back to the client
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper: resolve post identifier (GUID primary key) -> { id }
function resolvePostIdentifier(identifier, cb) {
  db.get('SELECT id FROM posts WHERE id = ?', [identifier], (e, row) => {
    if (e) return cb(e);
    if (!row) return cb(new Error('Post not found'));
    cb(null, { id: row.id });
  });
}

// Helper: resolve user identifier -> { userId }
function resolveUserIdentifier(identifier, cb) {
  db.get('SELECT userId FROM users WHERE userId = ?', [identifier], (e, row) => {
    if (e) return cb(e);
    if (!row) return cb(new Error('User not found'));
    cb(null, { userId: row.userId });
  });
}

// Route: add a plain human comment to a post.
// Used by: comment submission flow in public/js/post.js.
app.post('/comments', async (req, res) => {
  const { postId, userId, commentText } = req.body;
  const createdAt = new Date().toISOString();
  resolvePostIdentifier(postId, (rErr, ids) => {
    if (rErr) return res.status(404).json({ error: rErr.message });
    // Escape HTML entities to prevent XSS injection
    const escapedCommentText = encode(commentText);
    db.run(
      'INSERT INTO comments (postId, userId, commentText, createdAt, sourceType) VALUES (?, ?, ?, ?, ?)',
      [ids.id, userId, escapedCommentText, createdAt, 'human'],
      function (err) {
        if (err) {
          res.status(500).json({ error: err.message });
        } else {
          res.status(201).json({ ok: true });
        }
      }
    );
  });
});

// Route: add human comment and auto-generate antagonist bot reply.
// Used by: "debate"/antagonist comment flow in public/js/post.js.
app.post('/human_comment', aiGenerationLimiter, (req, res) => {
  const { postId, userId, commentText, antagonistUserId } = req.body;
  const createdAt = new Date().toISOString();
  resolvePostIdentifier(postId, (rErr, ids) => {
    if (rErr) return res.status(404).json({ error: rErr.message });
    // Escape HTML entities to prevent XSS injection
    const escapedCommentText = encode(commentText);
    // Insert human comment first
    db.run(
      'INSERT INTO comments (postId, userId, commentText, createdAt, sourceType) VALUES (?, ?, ?, ?, ?)',
      [ids.id, userId, escapedCommentText, createdAt, 'human'],
      async function (humanErr) {
        if (humanErr) return res.status(500).json({ error: humanErr.message });

        // Then insert bot reply
        try {
          // Fetch both post text and language code to match reply language to post.
          const post = await new Promise((resolve, reject) => {
            db.get('SELECT postText, languageCode FROM posts WHERE id = ?', [ids.id], (err, row) => {
              if (err) reject(err);
              else resolve(row);
            });
          });

          if (!post) {
            return res.status(404).json({ error: 'Post not found' });
          }

          const locale = post.languageCode && post.languageCode.toLowerCase() === 'pt' ? 'pt' : 'en';
          const reply = await createCommentReply(post.postText, commentText, locale);
          let randomOponentId = null;

          const candidateAntagonistUserId =
            typeof antagonistUserId === 'string' && antagonistUserId.trim() !== '' ? antagonistUserId.trim() : null;

          if (candidateAntagonistUserId && candidateAntagonistUserId !== userId) {
            const antagonistExists = await new Promise((resolve, reject) => {
              resolveUserIdentifier(candidateAntagonistUserId, (uErr, userRow) => {
                if (uErr) {
                  if (uErr.message === 'User not found') return resolve(false);
                  return reject(uErr);
                }
                return resolve(Boolean(userRow?.userId));
              });
            });

            if (antagonistExists) {
              randomOponentId = candidateAntagonistUserId;
            }
          }

          if (randomOponentId === null) {
            try {
              // Excludes userId in the query itself so this can't loop forever
              // when userId is the only (or only remaining) user in the DB.
              randomOponentId = await getRandomUserIdFromDB(userId);
            } catch {
              return res.status(422).json({ error: 'No other bot account available to reply.' });
            }
          }

          const botCreatedAt = new Date().toISOString();
          // Escape HTML entities for user ID and AI-generated reply to prevent XSS injection
          const escapedUserId = encode(userId);
          const escapedReply = encode(reply);
          db.run(
            'INSERT INTO comments (postId, userId, commentText, createdAt, sourceType) VALUES (?, ?, ?, ?, ?)',
            [
              ids.id,
              randomOponentId,
              `<span style="color: red; font-weight: bold;">@${escapedUserId}</span> ${escapedReply}`,
              botCreatedAt,
              'bot',
            ],
            function (botErr) {
              if (botErr) return res.status(500).json({ error: botErr.message });
              res.status(201).json({ ok: true, antagonistUserId: randomOponentId });
            }
          );
        } catch (e) {
          res.status(500).json({ error: e.message });
        }
      }
    );
  });
});

// Route: list posts (search + limit).
// Used by: feeds in public/js/explore.js, public/js/latest_posts.js, and admin list in public/js/manage_posts.js.
app.get('/posts', (req, res) => {
  const { search = '', limit = 20 } = req.query; // Default to no search and limit to 20 posts

  const query = `
  SELECT p.*, u.profilePictureName AS authorProfilePicture
  FROM posts p
  LEFT JOIN users u ON p.userId = u.userId
  WHERE LOWER(p.postText) LIKE LOWER(?) 
  ORDER BY p.createdAt DESC
  LIMIT ?
`;
  db.all(query, [`%${search}%`, parseInt(limit, 10)], (err, posts) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      posts.forEach((p) => (p.imageFileName = `${p.id}.png`));
      res.status(200).json({ posts });
    }
  });
});

// Route: fetch one post with its comments by GUID.
// Used by: post details page loader in public/js/post.js and admin delete flow in public/js/manage_posts.js.
app.get('/posts/:postId', (req, res) => {
  const identifier = req.params.postId;
  resolvePostIdentifier(identifier, (rErr, ids) => {
    if (rErr) return res.status(404).json({ error: rErr.message });
    db.get(
      `SELECT p.*, u.profilePictureName AS authorProfilePicture
       FROM posts p LEFT JOIN users u ON p.userId = u.userId
       WHERE p.id = ?`,
      [ids.id],
      (pErr, post) => {
        if (pErr) return res.status(500).json({ error: pErr.message });
        if (!post) return res.status(404).json({ error: 'Post not found' });
        const commentsQuery = `
          SELECT c.*, u.profilePictureName AS authorProfilePicture
          FROM comments c
          LEFT JOIN users u ON c.userId = u.userId
          WHERE c.postId = ?
          ORDER BY c.createdAt ASC`;
        db.all(commentsQuery, [ids.id], (cErr, comments) => {
          if (cErr) return res.status(500).json({ error: cErr.message });
          post.comments = comments || [];
          post.imageFileName = `${post.id}.png`;
          res.status(200).json(post);
        });
      }
    );
  });
});

// Route: pretty URL page entry for a specific post.
// Used by: shared/direct links such as /post/<id>; serves post.html shell for public/js/post.js.
app.get('/post/:postId', (req, res) => {
  const identifier = req.params.postId;
  resolvePostIdentifier(identifier, (rErr, _ids) => {
    if (rErr) {
      // Not found -> 404 page
      const notFoundPath = path.join(path.resolve(), 'public', 'html', '404.html');
      return fs.existsSync(notFoundPath)
        ? res.status(404).sendFile(notFoundPath)
        : res.status(404).send('404 Not Found');
    }
    // Found -> serve static post.html (client will still fetch JSON via /posts/:id)
    const postHtml = path.join(path.resolve(), 'public', 'html', 'post.html');
    res.sendFile(postHtml);
  });
});

// Route: get one random user profile.
// Used by: navbar widget in public/js/navbar.js and random bot UI in public/js/random_bot.js.
app.get('/random-user', (req, res) => {
  const query = `
    SELECT userId, fullName, profilePictureName, description, countryRegion
    FROM users
    WHERE userId != ?
    ORDER BY RANDOM()
    LIMIT 1
  `;

  db.get(query, [DELETED_USER_ID], (err, user) => {
    if (err) {
      console.error('Error fetching random user:', err.message);
      res.status(500).json({ error: 'Failed to fetch random user' });
    } else if (!user) {
      res.status(404).json({ error: 'No users found' });
    } else {
      res.status(200).json(user);
    }
  });
});

// Route: delete a post and related media/comments (admin only).
// Used by: post management actions in public/js/manage_posts.js.
app.delete('/posts/:postId', (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const identifier = req.params.postId;
  resolvePostIdentifier(identifier, (rErr, ids) => {
    if (rErr) return res.status(404).json({ error: rErr.message });
    const deleteCommentsQuery = 'DELETE FROM comments WHERE postId = ?';
    db.run(deleteCommentsQuery, [ids.id], (cErr) => {
      if (cErr) {
        console.error('Error deleting comments:', cErr.message);
        return res.status(500).json({ error: 'Failed to delete comments' });
      }
      const imageFileName = `${ids.id}.png`;
      const thumbnailFileName = `${ids.id}-thumbnail.png`;
      const imagePath = path.join(postImagesDir, imageFileName);
      const thumbnailPath = path.join(postThumbnailsDir, thumbnailFileName);
      fs.unlink(imagePath, () => {});
      fs.unlink(thumbnailPath, () => {});
      db.run('DELETE FROM posts WHERE id = ?', [ids.id], (delErr) => {
        if (delErr) {
          console.error('Error deleting post:', delErr.message);
          return res.status(500).json({ error: 'Failed to delete post' });
        }
        res.status(200).json({ message: 'Post deleted successfully' });
      });
    });
  });
});

// Route: AI-assisted comment generation for a given post and tone.
// Used by: "generate comment" helper action in public/js/post.js.
app.post('/generate-comment', aiGenerationLimiter, async (req, res) => {
  const { postId, tone } = req.body;
  resolvePostIdentifier(postId, (rErr, ids) => {
    if (rErr) return res.status(404).json({ error: rErr.message });
    db.get('SELECT postText, languageCode FROM posts WHERE id = ?', [ids.id], async (err, row) => {
      if (err) return res.status(500).json({ error: 'Failed to fetch post text' });
      if (!row) return res.status(404).json({ error: 'Post not found' });
      try {
        // Use the post's language so generated comments match the post language.
        const locale = row.languageCode && row.languageCode.toLowerCase() === 'pt' ? 'pt' : 'en';
        const commentText = await createCommentText(row.postText, tone, locale);
        res.status(200).json({ commentText });
      } catch {
        res.status(500).json({ error: 'Failed to generate comment' });
      }
    });
  });
});

// Route: list all bot accounts.
// Used by: bot management table in public/js/manage_bots.js.
app.get('/bots', (req, res) => {
  db.all(
    'SELECT userId, fullName, profilePictureName, description, countryRegion FROM users WHERE userId != ? ORDER BY fullName',
    [DELETED_USER_ID],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.status(200).json({ bots: rows || [] });
    }
  );
});

// Route: create a bot account (admin only).
// Used by: bot creation form in public/js/manage_bots.js.
app.post('/bots', async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  let { userId, fullName, description, countryRegion } = req.body;

  // Validate character limits
  if (userId && userId.length > 20) {
    return res.status(400).json({ error: 'User ID must not exceed 20 characters' });
  }
  if (fullName && fullName.length > 100) {
    return res.status(400).json({ error: 'Full Name must not exceed 100 characters' });
  }
  if (countryRegion && countryRegion.length > 50) {
    return res.status(400).json({ error: 'Country/Region must not exceed 50 characters' });
  }
  if (description && description.length > 500) {
    return res.status(400).json({ error: 'Description must not exceed 500 characters' });
  }

  try {
    const { generateText } = await import('./text_creator.js');

    // Auto-generate missing fields
    if (!fullName) {
      fullName = await generateText(
        'Invent a realistic full name for a fictional social media user. Just the name, nothing else.'
      );
      fullName = fullName.replace(/["']/g, '').trim();
    }

    if (!userId) {
      userId = await generateText(
        `Invent a short social media username (no spaces, no special characters) for a person named "${fullName}". Just the username, nothing else.`
      );
      userId = userId.replace(/[^a-zA-Z0-9_]/g, '').trim();
    }

    // Check for duplicates
    const existing = await new Promise((resolve, reject) => {
      db.get('SELECT userId FROM users WHERE userId = ?', [userId], (e, row) => {
        if (e) return reject(e);
        resolve(row);
      });
    }).catch(() => null);
    if (existing) return res.status(409).json({ error: 'A bot with this userId already exists' });

    if (!description) {
      description = await generateText(
        `Write a social media bio for a fictional person named "${fullName}". 
        Just the bio text, no explanation, no quotes. 
        Make it interesting and realistic but keep it concise (under 200 characters).`
      );
    }
  } catch (e) {
    console.error('Error auto-generating bot fields:', e);
    return res.status(500).json({ error: 'Failed to auto-generate bot content' });
  }

  try {
    const profilePictureName = await createUserImage(userId, fullName, description);
    // Escape user-entered fields to prevent XSS
    const escapedUserId = encode(userId);
    const escapedFullName = encode(fullName);
    const escapedDescription = encode(description);
    const escapedCountryRegion = countryRegion ? encode(countryRegion) : null;
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO users (userId, fullName, profilePictureName, description, countryRegion) VALUES (?, ?, ?, ?, ?)',
        [escapedUserId, escapedFullName, profilePictureName, escapedDescription, escapedCountryRegion],
        function (err) {
          if (err) return reject(err);
          resolve();
        }
      );
    });
    res.status(201).json({ userId, fullName, profilePictureName, description, countryRegion });
  } catch (error) {
    console.error('Error creating bot:', error);
    res.status(500).json({ error: error.message || 'Failed to create bot' });
  }
});

// Route: delete a bot account (admin only).
// Used by: delete action in public/js/manage_bots.js.
app.delete('/bots/:userId', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  const { userId } = req.params;
  if (userId === DELETED_USER_ID) {
    return res.status(400).json({ error: 'Cannot delete the reserved placeholder account.' });
  }
  db.get('SELECT userId, profilePictureName FROM users WHERE userId = ?', [userId], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Bot not found' });

    // Reassign this bot's existing posts/comments to the placeholder account
    // rather than leaving them pointing at a userId that's about to stop existing.
    db.run('UPDATE posts SET userId = ? WHERE userId = ?', [DELETED_USER_ID, userId], (postsErr) => {
      if (postsErr) {
        console.error('Error reassigning posts to placeholder user:', postsErr.message);
        return res.status(500).json({ error: 'Failed to reassign posts before deleting bot' });
      }
      db.run('UPDATE comments SET userId = ? WHERE userId = ?', [DELETED_USER_ID, userId], (commentsErr) => {
        if (commentsErr) {
          console.error('Error reassigning comments to placeholder user:', commentsErr.message);
          return res.status(500).json({ error: 'Failed to reassign comments before deleting bot' });
        }

        // Delete profile picture and thumbnail
        if (row.profilePictureName) {
          const picPath = path.join(profilePicturesDir, row.profilePictureName);
          const thumbPath = path.join(profileThumbnailsDir, `${userId}-thumbnail.png`);
          fs.unlink(picPath, () => {});
          fs.unlink(thumbPath, () => {});
        }
        db.run('DELETE FROM users WHERE userId = ?', [userId], function (delErr) {
          if (delErr) return res.status(500).json({ error: 'Failed to delete bot' });
          res.status(200).json({ message: 'Bot deleted successfully' });
        });
      });
    });
  });
});

// 404 handler (must be after all other routes)
app.use((req, res) => {
  // If the client explicitly wants JSON (API), return JSON 404
  if (req.accepts('json') && !req.accepts('html')) {
    return res.status(404).json({ error: 'Not Found' });
  }
  const notFoundPath = path.join(path.resolve(), 'public', 'html', '404.html');
  if (fs.existsSync(notFoundPath)) {
    res.status(404).sendFile(notFoundPath);
  } else {
    res.status(404).send('404 Not Found');
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`);
});
