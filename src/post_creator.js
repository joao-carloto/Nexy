import dotenv from "dotenv";
import process from "process";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import sqlite3 from "sqlite3";
import { GoogleGenerativeAI } from "@google/generative-ai";

import {
  generateImage,
  createUserImage,
  editImage,
  resizeImage,
  cropAndResizeToThumbnail,
} from "./image_creator.js";
import {
  getRandomElement,
  getRandomBoolean,
  getRandomUserIdFromDB,
} from "./utils.js";
import {
  createPostText,
  createCommentText,
  cleanUpPost,
  mockImage,
  editText,
} from "./text_creator.js";

const db = new sqlite3.Database("./data/nexyDB.sqlite");

// Load environment variables from .env file
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const serious_topics = [
  "Economy",
  "Sports",
  "Politics",
  "World News",
  "Business",
  "Technology",
  "Health",
  "Entertainment",
  "Lifestyle",
  "Opinion",
  "Science",
  "Immigration",
  "Education",
  "Weather",
];

// const lightTopics = ['social media post', 'some celebrity', 'internet influencer product placement']

const lightTopics = [
  "some music celebrity",
  "some TV celebrity",
  "some movie celebrity",
  "some sports celebrity",
];

// TODO: remove
const userIds = [
  "SunnySky123",
  "MoonlightMagic",
  "StarGazer89",
  "DreamerGirl",
  "TechieTom",
  "NatureLover",
  "BookWorm2025",
  "TravelBug",
  "MusicFanatic",
  "CreativeSoul",
  "JohnDoe",
  "JaneSmith",
  "AlexJohnson",
  "EmilyBrown",
  "MichaelWilliams",
  "SarahDavis",
  "DavidClark",
  "LauraMartinez",
  "ChrisTaylor",
  "JessicaLee",
];

function removeHashtags(text) {
  return text.replace(/#[\w-]+/g, "").trim();
}

function removeEmojis(text) {
  return text.replace(/[\u{1F600}-\u{1F64F}]/gu, "").trim();
}

async function createAIPost({
  userId = undefined,
  topic = undefined,
  isFakeNews = undefined,
  numComments = undefined,
}) {
  if (userId === undefined) {
    userId = getRandomElement(userIds); // TODO: Remove this. Get user from DB
  }

  if (topic === undefined) {
    // Balance betwen 50% light and 50% serious topics.
    let random_index = Math.floor(Math.random() * 2);
    let topic_list = random_index === 0 ? serious_topics : lightTopics;
    topic = getRandomElement(topic_list);
  }

  if (isFakeNews === undefined) {
    isFakeNews = getRandomBoolean();
  }

  console.log(`Topic: ${topic}`);

  const postText = await createPostText(topic, isFakeNews);

  console.log("\nCaption:");
  console.log(postText);

  // TODO: review
  const imageFileName = await generateImage(
    `Create a realistic square photo inspired by this text: "${removeEmojis(
      removeHashtags(postText)
    )}"`
  );

  // If not defined, create between 1 and 7 comments.
  if (numComments === undefined) {
    numComments = Math.floor(Math.random() * 7) + 1;
  }

  const postId = await savePost(userId, postText, imageFileName);
  for (let i = 0; i < numComments; i++) {
    const commentText = cleanUpPost(await createCommentText(postText));

    console.log("\nComment:");
    console.log(commentText);

    const commentUserId = await getRandomUserIdFromDB();
    saveComment(postId, commentUserId, commentText);
  }

  console.log(`Post created with id: ${postId}`);

  // Return the post ID
  return postId;
}

async function savePost(userId, postText, imageFileName) {
  return new Promise((resolve, reject) => {
    const createdAt = new Date().toISOString();
    const query =
      "INSERT INTO posts (userId, postText, imageFileName, createdAt) VALUES (?, ?, ?, ?)";

    db.run(query, [userId, postText, imageFileName, createdAt], function (err) {
      if (err) {
        console.error(err.message);
        reject(err);
      } else {
        console.log(`Post created with id: ${this.lastID}`);
        resolve(this.lastID);
      }
    });
  });
}

async function saveComment(postId, userId, commentText) {
  return new Promise((resolve, reject) => {
    const createdAt = new Date().toISOString();
    const query =
      "INSERT INTO comments (postId, userId, commentText, createdAt) VALUES (?, ?, ?, ?)";

    db.run(query, [postId, userId, commentText, createdAt], function (err) {
      if (err) {
        console.error(err.message);
        reject(err);
      } else {
        console.log(`Comment created with id: ${this.lastID}`);
        resolve(this.lastID);
      }
    });
  });
}

async function createUser() {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
  });

  const prompt =
    "Create a random username, full user name, and a short bio. The username should not contain any special characters. The bio should be a short description of the user's unusual interests and hobbies written in the first person. Provide results separated by commas. Single result.";
  const content = await model.generateContent(prompt);
  const contentText = content.response.text();

  console.log(contentText);

  // Parse the generated content (assuming it's in the format: "userId, fullName, description")
  const [userId, fullName, description] = contentText
    .split(",")
    .map((item) => item.trim());

  // Generate a profile picture
  const profilePictureName = await createUserImage(
    userId,
    fullName,
    description
  );

  // Persist the user in the database
  return new Promise((resolve, reject) => {
    const query = `
      INSERT INTO users (userId, fullName, profilePictureName, description, countryRegion)
      VALUES (?, ?, ?, ?, ?)
    `;
    const countryRegion = "USA"; // Default value for country/region

    db.run(
      query,
      [userId, fullName, profilePictureName, description, countryRegion],
      function (err) {
        if (err) {
          console.error("Error inserting user into database:", err.message);
          reject(err);
        } else {
          console.log(`User created with ID: ${userId}`);
          resolve({
            userId,
            fullName,
            profilePictureName,
            description,
            countryRegion,
          });
        }
      }
    );
  });
}

async function createHumanPost(userId, postText, originalImageFileName) {
  const createdAt = new Date().toISOString();

  try {
    // Validate input
    if (!userId || !postText) {
      throw new Error("User ID and post text are required.");
    }

    // Edit the post text
    let editedPostText = await editText(postText);

    let originalImagePath = null;
    let mockingImageText = null;
    if (originalImageFileName) {
      originalImagePath = path.join(
        path.resolve(),
        "data/images",
        originalImageFileName
      );

      // Resize the image.
      try {
        await resizeImage(
          originalImageFileName,
          "data/images",
          "data/images",
          null,
          1080,
          null
        );
      } catch (error) {
        throw new Error("Failed to resize the image.");
      }

      // Create text making fun of the image content.
      try {
        mockingImageText = await mockImage(originalImagePath);
      } catch (error) {
        throw new Error("Failed to mock the image.");
      }
    }

    if (mockingImageText) {
      editedPostText = editedPostText + "</br>" + mockingImageText;
    }

    const editedImageFileName = `${uuidv4()}.png`; // Generate a new filename for the edited image
    const editedImagePath = path.join(
      path.resolve(),
      "data/images",
      editedImageFileName
    );

    // Edit the image and save it
    try {
      await editImage(originalImagePath, editedImagePath);
    } catch (error) {
      throw new Error("Failed to edit the image: " + error.message); // TODO: turn on the VPN message "gemini-2.0-flash-exp-image-generation is not found"
    }

    // Create thumbnail for the edited image

    const fileNameWithoutExt = path.parse(editedImageFileName).name;
    const fileExt = path.extname(editedImageFileName);
    const thumbnailFileName = `${fileNameWithoutExt}-thumbnail${fileExt}`;

    try {
      await cropAndResizeToThumbnail(
        editedImageFileName,
        "./data/images",
        "./data/thumbnails/images",
        thumbnailFileName,
        200
      );
    } catch (error) {
      throw new Error("Failed to create a thumbnail for the image.");
    }

    // Save the post with the edited text and image
    return new Promise((resolve, reject) => {
      const query =
        "INSERT INTO posts (userId, postText, imageFileName, createdAt) VALUES (?, ?, ?, ?)";
      db.run(
        query,
        [userId, editedPostText, editedImageFileName, createdAt],
        function (err) {
          if (err) {
            reject(new Error("Failed to save the post to the database."));
          } else {
            resolve({ postId: this.lastID });
          }
        }
      );
    });
  } catch (error) {
    console.error("Error in createHumanPost:", error.message);
    throw error; // Re-throw the error to handle it in the calling function
  }
}

export { createAIPost, createHumanPost };

// TODO: remove
console.clear();

// TODO: remove
// editImage("C:\\Users\\joao-carloto\\Pictures\\unnamed.png", "edited.png");

// createAIPost({ topic: "Economy", isFakeNews: true });

// createPost({});

/*
distortPostText(
  "What a wonderfull the sunset was lat night. I was at the beach and the sky was so beautiful. I love sunsets."
);
*/

// createHumanPost("TUMBA", " I like ice-cream!", "1743606767632.png");

// createAIPost({});

// createUser();
