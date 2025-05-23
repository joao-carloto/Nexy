import fs from "fs";
import process from "process";
import express from "express";
import sqlite3 from "sqlite3";
import path from "path";
import multer from "multer";
import { createAIPost, createHumanPost } from "./post_creator.js";
import { createCommentText, createCommentReply } from "./text_creator.js";
import { getPostTextFromDB, getRandomUserIdFromDB } from "./utils.js";

const app = express();
const dbPath = path.join(path.resolve(), "data/nexyDB.sqlite");

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
app.use(express.static(path.join(path.resolve(), "public")));

app.use(
  "/data/images",
  express.static(path.join(path.resolve(), "data/images"))
);

app.use(
  "/data/profile_pictures",
  express.static(path.join(path.resolve(), "data/profile_pictures"))
);

app.use(
  "/data/thumbnails/images",
  express.static(path.join(path.resolve(), "data/thumbnails/images"))
);

app.use(
  "/data/thumbnails/profile-pictures",
  express.static(path.join(path.resolve(), "data/thumbnails/profile_pictures"))
);

// Set up multer for image storage
const storage = multer.diskStorage({
  destination: path.join(path.resolve(), "data/images"),
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

// Initialize database tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    postText TEXT NOT NULL,
    imageFileName TEXT,
    createdAt TEXT NOT NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    postId INTEGER NOT NULL,
    userId TEXT NOT NULL,
    commentText TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    FOREIGN KEY (postId) REFERENCES posts(id)
  )`);

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
    res
      .status(500)
      .json({ error: error.message || "Failed to generate bot post" });
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

// Route to save a comment
app.post("/comments", async (req, res) => {
  const { postId, userId, commentText } = req.body;
  const createdAt = new Date().toISOString();

  const query =
    "INSERT INTO comments (postId, userId, commentText, createdAt) VALUES (?, ?, ?, ?)";
  db.run(query, [postId, userId, commentText, createdAt], function (err) {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.status(201).json({ commentId: this.lastID });
    }
  });
});

// Route to save a human comment and generate a bot reply
app.post("/human_comment", async (req, res) => {
  const { postId, userId, commentText } = req.body;
  const createdAt = new Date().toISOString();

  const insertCommentQuery =
    "INSERT INTO comments (postId, userId, commentText, createdAt) VALUES (?, ?, ?, ?)";

  // Insert the human comment first
  db.run(
    insertCommentQuery,
    [postId, userId, commentText, createdAt],
    async function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      const humanCommentId = this.lastID;
      // Now generate the bot reply
      try {
        const post_text = await getPostTextFromDB(postId);
        const reply = await createCommentReply(post_text, commentText);
        const randomUserId = await getRandomUserIdFromDB();
        const botCreatedAt = new Date().toISOString();
        db.run(
          insertCommentQuery,
          [
            postId,
            randomUserId,
            `<span style="color: red; font-weight: bold;">@${userId}</span> ${reply}`,
            botCreatedAt,
          ],
          function (botErr) {
            if (botErr) {
              // Still return success for the human comment, but include bot error
              return res
                .status(201)
                .json({ commentId: humanCommentId, botError: botErr.message });
            }
            const botReplyId = this.lastID;
            res.status(201).json({ commentId: humanCommentId, botReplyId });
          }
        );
      } catch (e) {
        // If bot reply fails, still return success for the human comment
        res
          .status(201)
          .json({ commentId: humanCommentId, botError: e.message });
      }
    }
  );
});

// Route to fetch posts and comments
app.get("/posts", (req, res) => {
  const { search = "", limit = 10 } = req.query; // Default to no search and limit to 10 posts

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
      res.status(200).json({ posts });
    }
  });
});

// Route to fetch a specific post by ID
app.get("/posts/:id", (req, res) => {
  const postId = req.params.id;
  const postQuery = "SELECT * FROM posts WHERE id = ?;";
  const commentsQuery = "SELECT * FROM comments WHERE postId = ?;";

  db.get(postQuery, [postId], (err, post) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else if (!post) {
      res.status(404).json({ error: "Post not found" });
    } else {
      db.all(commentsQuery, [postId], (err, comments) => {
        if (err) {
          res.status(500).json({ error: err.message });
        } else {
          post.comments = comments;
          res.status(200).json(post);
        }
      });
    }
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

app.delete("/posts/:id", (req, res) => {
  const postId = req.params.id;

  // Query to delete the post's comments
  const deleteCommentsQuery = "DELETE FROM comments WHERE postId = ?";
  db.run(deleteCommentsQuery, [postId], (err) => {
    if (err) {
      console.error("Error deleting comments:", err.message);
      return res.status(500).json({ error: "Failed to delete comments" });
    }

    // Query to get the post's image file name
    const getImageQuery = "SELECT imageFileName FROM posts WHERE id = ?";
    db.get(getImageQuery, [postId], (err, row) => {
      if (err) {
        console.error("Error fetching post image:", err.message);
        return res.status(500).json({ error: "Failed to fetch post image" });
      }

      if (row && row.imageFileName) {
        const imageFileName = row.imageFileName;
        const thumbnailFileName = imageFileName.replace(
          /(\.[\w\d_-]+)$/i,
          "-thumbnail$1"
        );

        // Delete the image file
        const imagePath = path.join(
          path.resolve(),
          "data/images",
          imageFileName
        );
        const thumbnailPath = path.join(
          path.resolve(),
          "data/thumbnails/images",
          thumbnailFileName
        );

        fs.unlink(imagePath, (err) => {
          if (err) console.error("Error deleting image file:", err.message);
        });

        fs.unlink(thumbnailPath, (err) => {
          if (err) console.error("Error deleting thumbnail file:", err.message);
        });
      }

      // Query to delete the post
      const deletePostQuery = "DELETE FROM posts WHERE id = ?";
      db.run(deletePostQuery, [postId], (err) => {
        if (err) {
          console.error("Error deleting post:", err.message);
          return res.status(500).json({ error: "Failed to delete post" });
        }

        res.status(200).json({ message: "Post deleted successfully" });
      });
    });
  });
});

app.post("/generate-comment", async (req, res) => {
  const { postId, tone } = req.body;

  try {
    // Fetch the post text from the database
    const query = "SELECT postText FROM posts WHERE id = ?";
    db.get(query, [postId], async (err, row) => {
      if (err) {
        console.error("Error fetching post text:", err.message);
        return res.status(500).json({ error: "Failed to fetch post text" });
      }

      if (!row) {
        return res.status(404).json({ error: "Post not found" });
      }

      const postText = row.postText;

      // Generate the comment text
      const commentText = await createCommentText(postText, tone);
      res.status(200).json({ commentText });
    });
  } catch (error) {
    console.error("Error generating comment:", error.message);
    res.status(500).json({ error: "Failed to generate comment" });
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log("Server is running on http://0.0.0.0:3000");
});
