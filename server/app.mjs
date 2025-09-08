import fs from "fs";
import process from "process";
import express from "express";
import sqlite3 from "sqlite3";
import path from "path";
import multer from "multer";
import { createAIPost, createHumanPost } from "./post_creator.js";
import {
  createCommentText,
  createCommentReply,
} from "../server/text_creator.js";
import { getPostTextFromDB, getRandomUserIdFromDB } from "../server/utils.js";

const app = express();
const dbPath = path.join(path.resolve(), "server/data/nexyDB.sqlite");

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Error opening database:", err.message);
  } else {
    console.log("Database opened successfully");
  }
});

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files
// Redirect root to explore.html
app.get("/", (req, res) => {
  res.redirect("/explore.html");
});
app.use(express.static(path.join(path.resolve(), "public")));

// TODO. do we really need all this static stuff, since we already use the public directory?
app.use(
  "/post_images",
  express.static(path.join(path.resolve(), "public/post_images"))
);

app.use(
  "/profile_pictures",
  express.static(path.join(path.resolve(), "public/profile_pictures"))
);

app.use(
  "/thumbnails/post_images",
  express.static(path.join(path.resolve(), "public/thumbnails/post_images"))
);

app.use(
  "/thumbnails/profile_pictures",
  express.static(
    path.join(path.resolve(), "public/thumbnails/profile_pictures")
  )
);

// Set up multer for image storage
const storage = multer.diskStorage({
  destination: path.join(path.resolve(), "public/post_images"),
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
  db.run("CREATE INDEX IF NOT EXISTS idx_comments_postId ON comments(postId)");

  db.run(`CREATE TABLE IF NOT EXISTS users (
    userId TEXT PRIMARY KEY,
    fullName TEXT NOT NULL,
    profilePictureName TEXT,
    description TEXT,
    countryRegion TEXT
  )`);
});

// Route to create an AI generated post
app.post("/create_bot_post", async (req, res) => {
  let { topic, isFakeNews, numComments } = req.body;
  // All fields are optional
  if (typeof topic !== "string") topic = "";
  if (typeof isFakeNews === "undefined") isFakeNews = false;
  // If numComments is not set or invalid, pick a random number between 1 and 5
  if (typeof numComments === "undefined" || isNaN(Number(numComments))) {
    numComments = Math.floor(Math.random() * 5) + 1;
  }
  console.log("/create_bot_post received:", { topic, isFakeNews, numComments });
  try {
    const postId = await createAIPost({
      topic,
      isFakeNews,
      numComments,
    });
    res.status(201).json({ postId });
  } catch (error) {
    console.error("Error generating bot post:", error);
    res.status(500).json({
      error: error.message || String(error) || "Failed to generate bot post",
    });
  }
});

// Route to save a post
app.post("/create_human_post", upload.single("image"), async (req, res) => {
  const { userId, postText } = req.body;
  const originalImageFileName = req.file ? req.file.filename : null;
  try {
    // Call the createHumanPost function
    const result = await createHumanPost(
      userId,
      postText,
      originalImageFileName
    );

    // Send a success response back to the client
    res.status(200).json({ success: true, postId: result.postId });
  } catch (error) {
    console.error("Error creating human post:", error.message);

    // Send an error response back to the client
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper: resolve post identifier (GUID primary key) -> { id }
function resolvePostIdentifier(identifier, cb) {
  db.get("SELECT id FROM posts WHERE id = ?", [identifier], (e, row) => {
    if (e) return cb(e);
    if (!row) return cb(new Error("Post not found"));
    cb(null, { id: row.id });
  });
}

// Route to save a comment (accepts GUID or numeric in postId field, stores GUID only)
app.post("/comments", async (req, res) => {
  const { postId, userId, commentText } = req.body;
  const createdAt = new Date().toISOString();
  resolvePostIdentifier(postId, (rErr, ids) => {
    if (rErr) return res.status(404).json({ error: rErr.message });
    const query =
      "INSERT INTO comments (postId, userId, commentText, createdAt, sourceType) VALUES (?, ?, ?, ?, ?)";
    db.run(
      query,
      [ids.id, userId, commentText, createdAt, "bot"],
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
app.post("/human_comment", async (req, res) => {
  const { postId, userId, commentText } = req.body;
  const createdAt = new Date().toISOString();
  resolvePostIdentifier(postId, (rErr, ids) => {
    if (rErr) return res.status(404).json({ error: rErr.message });
    const insertCommentQuery =
      "INSERT INTO comments (postId, userId, commentText, createdAt, sourceType) VALUES (?, ?, ?, ?, ?)";
    db.run(
      insertCommentQuery,
      [ids.id, userId, commentText, createdAt, "human"],
      async function (err) {
        if (err) return res.status(500).json({ error: err.message });
        // Human comment inserted
        try {
          const post_text = await getPostTextFromDB(ids.id);
          const reply = await createCommentReply(post_text, commentText);
          let randomOponentId = null;
          while (randomOponentId === null || randomOponentId === userId) {
            randomOponentId = await getRandomUserIdFromDB();
          }
          await getRandomUserIdFromDB();
          const botCreatedAt = new Date().toISOString();
          db.run(
            insertCommentQuery,
            [
              ids.id,
              randomOponentId,
              `<span style="color: red; font-weight: bold;">@${userId}</span> ${reply}`,
              botCreatedAt,
              "bot",
            ],
            function (botErr) {
              if (botErr)
                return res
                  .status(201)
                  .json({ ok: true, botError: botErr.message });
              res.status(201).json({ ok: true });
            }
          );
        } catch (e) {
          res.status(201).json({ ok: true, botError: e.message });
        }
      }
    );
  });
});

// Route to fetch posts and comments
app.get("/posts", (req, res) => {
  const { search = "", limit = 20 } = req.query; // Default to no search and limit to 20 posts

  const query = `
  SELECT * FROM posts
  WHERE LOWER(postText) LIKE LOWER(?) 
  ORDER BY createdAt DESC
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
app.get("/posts/:postId", (req, res) => {
  const identifier = req.params.postId;
  resolvePostIdentifier(identifier, (rErr, ids) => {
    if (rErr) return res.status(404).json({ error: rErr.message });
    db.get("SELECT * FROM posts WHERE id = ?", [ids.id], (pErr, post) => {
      if (pErr) return res.status(500).json({ error: pErr.message });
      if (!post) return res.status(404).json({ error: "Post not found" });
      const commentsQuery =
        "SELECT * FROM comments WHERE postId = ? ORDER BY createdAt ASC";
      db.all(commentsQuery, [ids.id], (cErr, comments) => {
        if (cErr) return res.status(500).json({ error: cErr.message });
        post.comments = comments || [];
        post.imageFileName = `${post.id}.png`;
        res.status(200).json(post);
      });
    });
  });
});

// Pretty URL: /post/<id> -> serve post.html if exists; otherwise 404 page
app.get("/post/:postId", (req, res) => {
  const identifier = req.params.postId;
  resolvePostIdentifier(identifier, (rErr, ids) => {
    if (rErr) {
      // Not found -> 404 page
      const notFoundPath = path.join(path.resolve(), "public", "404.html");
      return fs.existsSync(notFoundPath)
        ? res.status(404).sendFile(notFoundPath)
        : res.status(404).send("404 Not Found");
    }
    // Found -> serve static post.html (client will still fetch JSON via /posts/:id)
    const postHtml = path.join(path.resolve(), "public", "post.html");
    res.sendFile(postHtml);
  });
});

app.get("/random-user", (req, res) => {
  const query = `
    SELECT userId, fullName, profilePictureName, description, countryRegion
    FROM users
    ORDER BY RANDOM()
    LIMIT 1
  `;

  db.get(query, (err, user) => {
    if (err) {
      console.error("Error fetching random user:", err.message);
      res.status(500).json({ error: "Failed to fetch random user" });
    } else if (!user) {
      res.status(404).json({ error: "No users found" });
    } else {
      res.status(200).json(user);
    }
  });
});

app.delete("/posts/:postId", (req, res) => {
  const identifier = req.params.postId;
  resolvePostIdentifier(identifier, (rErr, ids) => {
    if (rErr) return res.status(404).json({ error: rErr.message });
    const deleteCommentsQuery = "DELETE FROM comments WHERE postId = ?";
    db.run(deleteCommentsQuery, [ids.id], (cErr) => {
      if (cErr) {
        console.error("Error deleting comments:", cErr.message);
        return res.status(500).json({ error: "Failed to delete comments" });
      }
      const imageFileName = `${ids.id}.png`;
      const thumbnailFileName = `${ids.id}-thumbnail.png`;
      const imagePath = path.join(
        path.resolve(),
        "public/post_images",
        imageFileName
      );
      const thumbnailPath = path.join(
        path.resolve(),
        "public/thumbnails/post_images",
        thumbnailFileName
      );
      fs.unlink(imagePath, () => {});
      fs.unlink(thumbnailPath, () => {});
      db.run("DELETE FROM posts WHERE id = ?", [ids.id], (delErr) => {
        if (delErr) {
          console.error("Error deleting post:", delErr.message);
          return res.status(500).json({ error: "Failed to delete post" });
        }
        res.status(200).json({ message: "Post deleted successfully" });
      });
    });
  });
});

app.post("/generate-comment", async (req, res) => {
  const { postId, tone } = req.body;
  resolvePostIdentifier(postId, (rErr, ids) => {
    if (rErr) return res.status(404).json({ error: rErr.message });
    db.get(
      "SELECT postText FROM posts WHERE id = ?",
      [ids.id],
      async (err, row) => {
        if (err)
          return res.status(500).json({ error: "Failed to fetch post text" });
        if (!row) return res.status(404).json({ error: "Post not found" });
        try {
          const commentText = await createCommentText(row.postText, tone);
          res.status(200).json({ commentText });
        } catch (e) {
          res.status(500).json({ error: "Failed to generate comment" });
        }
      }
    );
  });
});

// 404 handler (must be after all other routes)
app.use((req, res) => {
  // If the client explicitly wants JSON (API), return JSON 404
  if (req.accepts("json") && !req.accepts("html")) {
    return res.status(404).json({ error: "Not Found" });
  }
  const notFoundPath = path.join(path.resolve(), "public", "404.html");
  if (fs.existsSync(notFoundPath)) {
    res.status(404).sendFile(notFoundPath);
  } else {
    res.status(404).send("404 Not Found");
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log("Server is running on http://0.0.0.0:3000");
});
