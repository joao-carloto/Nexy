import fs from 'fs';
import process from 'process';
import express from 'express';
import sqlite3 from 'sqlite3';
import path from 'path';
import multer from 'multer';
import crypto from 'crypto';
import dotenv from 'dotenv';
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

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Database opened successfully');
  }
});

// Middleware to parse JSON bodies
app.use(express.json());

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
const ADMIN_TOKEN_SECRET = process.env.ADMIN_TOKEN_SECRET || 'nexy-admin-secret';

function generateAdminToken() {
  // Derive a stable HMAC from password + secret
  return crypto.createHmac('sha256', ADMIN_TOKEN_SECRET).update(ADMIN_PASSWORD).digest('hex');
}

function isAdmin(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies.adminAuth;
  if (!token || !ADMIN_PASSWORD) return false;
  return token === generateAdminToken();
}

// Middleware to protect admin pages
function requireAdminPage(req, res, next) {
  if (!isAdmin(req)) {
    return res.redirect('/login.html');
  }
  next();
}

// Intercept request for manage_posts.html before static middleware serves it
app.get('/manage_posts.html', requireAdminPage, (req, res) => {
  // Serve the file explicitly (bypass redirect loop)
  const filePath = path.join(path.resolve(), 'public', 'html', 'manage_posts.html');
  res.sendFile(filePath);
});

// Intercept request for manage_bots.html before static middleware serves it
app.get('/manage_bots.html', requireAdminPage, (req, res) => {
  const filePath = path.join(path.resolve(), 'public', 'html', 'manage_bots.html');
  res.sendFile(filePath);
});

// Login endpoint
app.post('/login', (req, res) => {
  const { password } = req.body || {};
  if (!ADMIN_PASSWORD) {
    return res.status(500).json({ error: 'Admin password not configured on server' });
  }
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  const token = generateAdminToken();
  // Set HttpOnly cookie (no secure flag since may be served over http locally)
  res.setHeader('Set-Cookie', `adminAuth=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${60 * 60}`);
  res.json({ ok: true });
});

// Logout endpoint
app.get('/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'adminAuth=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
  res.redirect('/login.html');
});

// Serve static files
// Redirect root to explore.html
app.get('/', (req, res) => {
  res.redirect('/explore.html');
});
app.use(express.static(path.join(path.resolve(), 'public')));
app.use(express.static(path.join(path.resolve(), 'public', 'html')));

app.use('/post_images', express.static(postImagesDir));

app.use('/profile_pictures', express.static(profilePicturesDir));

app.use('/thumbnails/post_images', express.static(postThumbnailsDir));

app.use('/thumbnails/profile_pictures', express.static(profileThumbnailsDir));

// Set up multer for image storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync(postImagesDir, { recursive: true });
    cb(null, postImagesDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

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
});

// Route to create an AI generated post
app.post('/create_bot_post', async (req, res) => {
  let { topic, isFakeNews, numComments } = req.body;
  // All fields are optional
  if (typeof topic !== 'string') topic = '';
  if (typeof isFakeNews === 'undefined') isFakeNews = false;
  // If numComments is not set or invalid, pick a random number between 1 and 5
  if (typeof numComments === 'undefined' || isNaN(Number(numComments))) {
    numComments = Math.floor(Math.random() * 5) + 1;
  }
  console.log('/create_bot_post received:', { topic, isFakeNews, numComments });
  try {
    const postId = await createAIPost({
      topic,
      isFakeNews,
      numComments,
    });
    res.status(201).json({ postId });
  } catch (error) {
    console.error('Error generating bot post:', error);
    res.status(500).json({
      error: error.message || String(error) || 'Failed to generate bot post',
    });
  }
});

// Route to create a PsyOp post
app.post('/create_psyop_post', async (req, res) => {
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

// Route to save a post
app.post('/create_human_post', upload.single('image'), async (req, res) => {
  const { userId, postText } = req.body;
  const originalImageFileName = req.file ? req.file.filename : null;
  try {
    // Validate postText length
    if (!postText || postText.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Post text is required' });
    }
    if (postText.length > 500) {
      return res.status(400).json({ success: false, error: 'Post text exceeds maximum length of 500 characters' });
    }
    // Call the createHumanPost function
    const result = await createHumanPost(userId, postText, originalImageFileName);

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

// Route to save a comment (accepts GUID or numeric in postId field, stores GUID only)
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

// Route to save a human comment and generate a bot reply (GUID stored)
app.post('/human_comment', (req, res) => {
  const { postId, userId, commentText } = req.body;
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
          const post_text = await getPostTextFromDB(ids.id);
          const reply = await createCommentReply(post_text, commentText);
          let randomOponentId = null;
          while (randomOponentId === null || randomOponentId === userId) {
            randomOponentId = await getRandomUserIdFromDB();
          }
          const botCreatedAt = new Date().toISOString();
          // Escape HTML entities for user ID to prevent XSS injection
          const escapedUserId = encode(userId);
          db.run(
            'INSERT INTO comments (postId, userId, commentText, createdAt, sourceType) VALUES (?, ?, ?, ?, ?)',
            [
              ids.id,
              randomOponentId,
              `<span style="color: red; font-weight: bold;">@${escapedUserId}</span> ${reply}`,
              botCreatedAt,
              'bot',
            ],
            function (botErr) {
              if (botErr) return res.status(500).json({ error: botErr.message });
              res.status(201).json({ ok: true });
            }
          );
        } catch (e) {
          res.status(500).json({ error: e.message });
        }
      }
    );
  });
});

// Route to fetch posts and comments
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

// Route to fetch a specific post by identifier (GUID)
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

// Pretty URL: /post/<id> -> serve post.html if exists; otherwise 404 page
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

app.get('/random-user', (req, res) => {
  const query = `
    SELECT userId, fullName, profilePictureName, description, countryRegion
    FROM users
    ORDER BY RANDOM()
    LIMIT 1
  `;

  db.get(query, (err, user) => {
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

app.post('/generate-comment', async (req, res) => {
  const { postId, tone } = req.body;
  resolvePostIdentifier(postId, (rErr, ids) => {
    if (rErr) return res.status(404).json({ error: rErr.message });
    db.get('SELECT postText FROM posts WHERE id = ?', [ids.id], async (err, row) => {
      if (err) return res.status(500).json({ error: 'Failed to fetch post text' });
      if (!row) return res.status(404).json({ error: 'Post not found' });
      try {
        const commentText = await createCommentText(row.postText, tone);
        res.status(200).json({ commentText });
      } catch (_e) {
        res.status(500).json({ error: 'Failed to generate comment' });
      }
    });
  });
});

// Route to fetch all bots
app.get('/bots', (req, res) => {
  db.all(
    'SELECT userId, fullName, profilePictureName, description, countryRegion FROM users ORDER BY fullName',
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.status(200).json({ bots: rows || [] });
    }
  );
});

// Route to create a new bot
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

// Route to delete a bot
app.delete('/bots/:userId', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  const { userId } = req.params;
  db.get('SELECT userId, profilePictureName FROM users WHERE userId = ?', [userId], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Bot not found' });
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
