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
} from "../server/utils.js";
import {
  createPostText,
  createCommentText,
  cleanUpPost,
  mockImage,
  editText,
} from "../server/text_creator.js";

const db = new sqlite3.Database("./server/data/nexyDB.sqlite");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Generate a random alphanumeric GUID with specified length
function generateGUID(length) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

// Load environment variables from .env file
dotenv.config();

// Gemini client removed (unused after commenting out createUser)

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

  if (topic === undefined || topic === "") {
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

  // Pre-generate postId so image file can share the same 11-char id
  const provisionalPostId = generateGUID(11);
  await generateImage(
    `Create a realistic square photo inspired by this text: "${removeEmojis(
      removeHashtags(postText)
    )}"`,
    provisionalPostId
  );

  // If not defined, create between 1 and 7 comments.
  if (
    numComments === undefined ||
    isNaN(Number(numComments)) ||
    numComments === "" ||
    numComments === null
  ) {
    numComments = Math.floor(Math.random() * 7) + 1;
  } else {
    numComments = Number(numComments);
  }

  // Persist with required bot metadata defaults
  // Use the provisionalPostId as the definitive id
  const postId = await savePost(
    userId,
    postText,
    { countryCode: "US", languageCode: "EN", sourceType: "bot" },
    provisionalPostId
  );

  // Use the provisionalPostId as the definitive id
  for (let i = 0; i < numComments; i++) {
    const commentText = cleanUpPost(await createCommentText(postText));

    console.log("\nComment:");
    console.log(commentText);

    const commentUserId = await getRandomUserIdFromDB();
    await saveComment(postId, commentUserId, commentText, "bot");
  }

  console.log(`Post created with id: ${postId}`);

  // Return the post ID
  return postId;
}

async function savePost(
  userId,
  postText,
  { countryCode = null, languageCode = null, sourceType = null } = {},
  forcedPostId = null
) {
  return new Promise((resolve, reject) => {
    const createdAt = new Date().toISOString();
    const postId = forcedPostId || generateGUID(11); // becomes primary key id
    const query =
      "INSERT INTO posts (id, userId, postText, createdAt, countryCode, languageCode, sourceType) VALUES (?, ?, ?, ?, ?, ?, ?)";

    db.run(
      query,
      [
        postId,
        userId,
        postText,
        createdAt,
        countryCode,
        languageCode,
        sourceType,
      ],
      function (err) {
        if (err) {
          console.error(err.message);
          reject(err);
        } else {
          console.log(`Post created with id: ${postId}`);
          resolve(postId);
        }
      }
    );
  });
}

async function saveComment(postId, userId, commentText, sourceType = null) {
  return new Promise((resolve, reject) => {
    const createdAt = new Date().toISOString();
    const query = sourceType
      ? "INSERT INTO comments (postId, userId, commentText, createdAt, sourceType) VALUES (?, ?, ?, ?, ?)"
      : "INSERT INTO comments (postId, userId, commentText, createdAt) VALUES (?, ?, ?, ?)";

    const params = sourceType
      ? [postId, userId, commentText, createdAt, sourceType]
      : [postId, userId, commentText, createdAt];

    db.run(query, params, function (err) {
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
        "public/post_images",
        originalImageFileName
      );

      // Resize the image.
      try {
        await resizeImage(
          originalImageFileName,
          "public/post_images",
          "public/post_images",
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

    // Pre-generate postId so edited image uses the same base name
    const postId = generateGUID(11);
    const editedImageFileName = `${postId}.png`;
    const editedImagePath = path.join(
      path.resolve(),
      "public/post_images",
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
        "./public/post_images",
        "./public/thumbnails/post_images",
        thumbnailFileName,
        200
      );
    } catch (error) {
      throw new Error("Failed to create a thumbnail for the image.");
    }

    // Save the post with the edited text and image
    return new Promise((resolve, reject) => {
      const query =
        "INSERT INTO posts (id, userId, postText, createdAt, countryCode, languageCode, sourceType) VALUES (?, ?, ?, ?, ?, ?, ?)";
      db.run(
        query,
        [
          postId,
          userId,
          editedPostText,
          createdAt,
          "US", // countryCode default for human post
          "EN", // languageCode default for human post
          "human", // sourceType
        ],
        function (err) {
          if (err) {
            reject(new Error("Failed to save the post to the database."));
          } else {
            resolve({ postId });
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
