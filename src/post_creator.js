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
  str = str.replace(/^(Image:.*?\.)(\s|$)/, "");
  str = str.replace(/^(Option.*?:)(\s|$)/, "");
  str = str.replace(/^(Option.*?:)(\s|$)/, "");
  str = str.replace(/.*social media post:/, "");
  str = str.replace(/Okay, here's one: /, "");
  str = str.replace(/Okay, here's one option: /, "");
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

function removeHashtags(text) {
  return text.replace(/#[\w-]+/g, "").trim();
}

function removeEmojis(text) {
  return text.replace(/[\u{1F600}-\u{1F64F}]/gu, "").trim();
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

  // Return the post ID
  return postId;
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

  let topicPrompt = `Provide me with a specific topic from the news or social media, about ${topic}, that can serve as inspiration for a social media post. ${options}. Don't explain it, just give me the content.`;
  let topicContent = await model.generateContent(topicPrompt);
  console.log(`\nResponse 1: ${topicContent.response.text()}`);

  let postPrompt = `Social media post inspired on this text: "${topicContent.response.text()}". Just one option. Include some emoji. Don't explain it, just give me the content.`;
  let postContent = await model.generateContent(postPrompt);
  console.log(`\nResponse 1: ${topicContent.response.text()}`);

  const postText = cleanUpPost(postContent.response.text());
  return postText;
}

async function editText(originalPostText, tone = undefined) {
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
  options = options + ` The text should have a ${tone} tone.`;
  const postPrompt = `Rewrite the following text: "${originalPostText}".${options}. Add a mention to the fact that you don't like llamas. Don't explain it, just give me the content.`;
  const postContent = await model.generateContent(postPrompt);
  const postText = postContent.response.text();

  console.log(postText);

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

// TODO: remove the input image
async function editImage(inputImagePath, outputImagePath) {
  const imageData = fs.readFileSync(inputImagePath);
  const base64Image = imageData.toString("base64");

  const contents = [
    {
      text: "Hi, This is a picture of me. Can you add a llama next to me? And also, I want to have a clown nose.",
    },
    {
      inlineData: {
        mimeType: "image/png",
        data: base64Image,
      },
    },
  ];

  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash-exp-image-generation",
    generationConfig: {
      responseModalities: ["Text", "Image"],
    },
  });

  try {
    const response = await model.generateContent(contents);
    for (const part of response.response.candidates[0].content.parts) {
      if (part.inlineData) {
        const imageData = part.inlineData.data;
        const buffer = Buffer.from(imageData, "base64");
        fs.writeFileSync(outputImagePath, buffer);
        console.log(`Image saved as ${outputImagePath}`);
      }
    }
  } catch (error) {
    console.error("Error generating content:", error);
    throw error;
  }
}

async function createUserImage(inspirationText) {
  // Set responseModalities to include "Image" so the model can generate  an image
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash-exp-image-generation",
    generationConfig: {
      responseModalities: ["Text", "Image"],
    },
  });

  const contents = `Create a realistic square photo of a person. The photo should be well-lit and in focus. The person should be looking directly at the camera. Use this as inspiration: "${inspirationText}".`;
  // "Create a user profile for a social media platform. Include a username, full name, profile picture, and a short bio. The username should be unique and not contain any special characters. The profile picture should be a realistic image of a person. The bio should be a short description of the user's interests and hobbies. Provide text results in array formt.";

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

        const imagePath = path.join(
          __dirname,
          "../data/profile_pictures",
          imageFileName
        );

        fs.writeFileSync(imagePath, buffer);
        console.log(`Image saved as ${imageFileName}`);
        return imageFileName;
      }
    }
  } catch (error) {
    console.error("Error generating content:", error);
  }
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

export { editImage, editText, createAIPost };

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

// createUser();
