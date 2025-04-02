import fs from "fs";
import dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { fileURLToPath } from "url";
import sqlite3 from "sqlite3";
import { GoogleGenerativeAI } from "@google/generative-ai";

import { generateImage, editImage, createUserImage } from "./image_creator.js";
import { getRandomElement, getRandomBoolean } from "./utils.js";
import {
  createPostText,
  createCommentText,
  cleanUpPost,
} from "./text_creator.js";

const db = new sqlite3.Database("./data/nexyDB.sqlite");

// Load environment variables from .env file
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Define __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    userId = getRandomElement(userIds);
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
  // TODO: uncomment
  // for (let i = 0; i < numComments; i++) {
  for (let i = 0; i < 3; i++) {
    const commentText = cleanUpPost(await createCommentText(postText));

    console.log("\nComment:");
    console.log(commentText);

    const commentUserId = getRandomElement(userIds);
    saveComment(postId, commentUserId, commentText);
  }

  console.log(`2 Post created with id: ${postId}`);

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
    "Create a random username, full user name, and a short bio. The userId should not contain any special characters. The bio should be a short description of the user's unusual interests and hobbies written in the first person. Provide results separated by commas. Single result.";
  const content = await model.generateContent(prompt);
  const contentText = content.response.text();

  console.log(contentText);

  // Parse the generated content (assuming it's in the format: "userId, fullName, bio")
  const [userId, fullName, description] = contentText
    .split(",")
    .map((item) => item.trim());

  // Generate a profile picture
  const profilePictureName = await createUserImage(description);

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

export { createAIPost };

// TODO: remove
console.clear();

// TODO: remove
// editImage("C:\\Users\\joao-carloto\\Pictures\\unnamed.png", "edited.png");

// createPost({topic: "Economy", isFakeNews: true})

// createPost({});

/*
distortPostText(
  "What a wonderfull the sunset was lat night. I was at the beach and the sky was so beautiful. I love sunsets."
);
*/

createAIPost({});
