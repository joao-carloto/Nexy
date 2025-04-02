import express from "express";
import sqlite3 from "sqlite3";
import path from "path";
import multer from "multer";
import { createAIPost } from "./post_creator.js";
import { editText } from "./text_creator.js";
import { editImage, resizeImage } from "./image_creator.js";
import { v4 as uuidv4 } from "uuid";

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

// Set up multer for image storage
const storage = multer.diskStorage({
  destination: path.join(path.resolve(), "data/images"),
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

const profilePictureStorage = multer.diskStorage({
  destination: path.join(path.resolve(), "data/profile_pictures"),
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});
const uploadProfilePicture = multer({ storage: profilePictureStorage });

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
app.post("/ai_posts", async (req, res) => {
  const { topic, isFakeNews, numComments } = req.body;

  try {
    const postId = await createAIPost({
      topic,
      isFakeNews,
      numComments,
    });
    res.status(201).json({ postId });
  } catch (error) {
    console.error("Error generating post:", error);
    res.status(500).json({ error: "Failed to generate post" });
  }
});

// Route to save a post
app.post("/posts", upload.single("image"), async (req, res) => {
  const { userId, postText } = req.body;
  const originalImageFileName = req.file ? req.file.filename : null;
  const createdAt = new Date().toISOString();

  try {
    // Edit the post text
    const editedPostText = await editText(postText);

    // Edit the image if it exists
    let editedImageFileName = null;
    if (originalImageFileName) {
      const originalImagePath = path.join(
        path.resolve(),
        "data/images",
        originalImageFileName
      );
      editedImageFileName = `${uuidv4()}.png`; // Generate a new filename for the edited image
      const editedImagePath = path.join(
        path.resolve(),
        "data/images",
        editedImageFileName
      );

      // Edit the image and save it
      await editImage(originalImagePath, editedImagePath);
      // Create thumbnail for the edited image

      await resizeImage(
        editedImagePath,
        "./data/images",
        "./data/thumbnails/images",
        150,
        150
      );
    }

    // Save the post with the edited text and image
    const query =
      "INSERT INTO posts (userId, postText, imageFileName, createdAt) VALUES (?, ?, ?, ?)";
    db.run(
      query,
      [userId, editedPostText, editedImageFileName, createdAt],
      function (err) {
        if (err) {
          res.status(500).json({ error: err.message });
        } else {
          res.status(201).json({ postId: this.lastID });
        }
      }
    );
  } catch (error) {
    console.error("Error processing post:", error);
    res.status(500).json({ error: "Failed to process post" });
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

// Route to fetch posts and comments
app.get("/posts", (req, res) => {
  const query = "SELECT * FROM posts ORDER BY createdAt DESC;";
  db.all(query, [], (err, posts) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      const postIds = posts.map((post) => post.id);
      const commentsQuery = `SELECT * FROM comments WHERE postId IN (${postIds.join(
        ","
      )})`;
      db.all(commentsQuery, [], (err, comments) => {
        if (err) {
          res.status(500).json({ error: err.message });
        } else {
          res.status(200).json({ posts, comments });
        }
      });
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

// Route to serve the index.html file
app.get("/", (req, res) => {
  res.sendFile(path.join(path.resolve(), "public/index.html"));
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
