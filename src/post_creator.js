import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { fileURLToPath } from "url";
import sqlite3 from "sqlite3";
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

const lightTopics = ["some celebrity"];

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

const tones = ["angry", "neutral", "cheerful"];

function getRandomElement(arr) {
  // Generate a random index based on the array length
  const randomIndex = Math.floor(Math.random() * arr.length);
  // Return the element at the random index
  return arr[randomIndex];
}

function getRandomBoolean() {
  return Math.random() >= 0.5;
}

function cleanUpPost(str) {
  // Somel regex cleanup
  str = str.replace(/\*\*.*?\*\*/g, "");
  str = str.replace(/\[.*?\]/g, "");
  // Split the string into an array of lines
  const lines = str.split("\n");
  // Filter out empty lines
  const nonEmptyLines = lines.filter((line) => line.trim() !== "");
  // Filter out lines that contain the specified content
  const filteredLines = nonEmptyLines.filter(
    (line) => !line.includes("Okay, here's a")
  );
  // Join the filtered lines back into a single string
  return filteredLines.join("\n");
}

async function generateImage(contents) {
  // Set responseModalities to include "Image" so the model can generate  an image
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash-exp-image-generation",
    generationConfig: {
      responseModalities: ["Text", "Image"],
    },
  });

  try {
    const response = await model.generateContent(contents);
    for (const part of response.response.candidates[0].content.parts) {
      // Based on the part type, either show the text or save the image
      if (part.text) {
        console.log(part.text);
      } else if (part.inlineData) {
        const imageData = part.inlineData.data;
        const buffer = Buffer.from(imageData, "base64");

        const imageFileName = uuidv4() + ".png";

        const imagePath = path.join(__dirname, "../data/images", imageFileName);

        fs.writeFileSync(imagePath, buffer);
        console.log(`Image saved as ${imageFileName}`);
        return imageFileName;
      }
    }
  } catch (error) {
    console.error("Error generating content:", error);
  }
}

async function createPost({
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

  const postText = await createPostText({ topic, isFakeNews });

  console.log("\nCaption:");
  console.log(postText);

  const imageFileName = await generateImage(
    `Create a realistic square photo inspired by: ${postText}`
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
}

async function createPostText(topic, isFakeNews) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    // TODO: use this?
    // systemInstruction: "You are a very dumb person.",
  });

  let options = "";

  if (isFakeNews) {
    options = options + " It should be a fictious story about real people.";
  }

  let topicPrompt = `Tell me about some random trending topic on the news or social media about ${topic}.${options}.`;
  let topicContent = await model.generateContent(topicPrompt);

  let postPrompt = `Small social media post inspired on ${topicContent.response.text()}. Just one option. Include some emoji. Don't explain it, just give me the content.`;
  let postContent = await model.generateContent(postPrompt);
  let postText = cleanUpPost(postContent.response.text());

  return postText;
}

async function createCommentText(postText, tone = undefined) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    // TODO: use this?
    // systemInstruction: "You are a very dumb person.",
  });
  let options = "";
  // If not defined, pick a tone.
  if (tone === undefined) {
    tone = getRandomElement(tones);
  }
  options = options + ` The comment should have a ${tone} tone.`;
  const commentPrompt = `Small social media comment responding to ${postText}. Just one option. Include some emoji.${options} Don't explain it, just give me the content.`;
  const commentContent = await model.generateContent(commentPrompt);
  const commentText = commentContent.response.text();
  return commentText;
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

// TODO: remove
console.clear();
// createPost({topic: "Economy", isFakeNews: true})

createPost({});
