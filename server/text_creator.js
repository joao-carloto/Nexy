import dotenv from "dotenv";
import process from "process";
import { getRandomElement } from "./utils.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { describeImage } from "./image_creator.js";

// Load environment variables from .env file
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const tones = ["positive", "neutral", "negative"];

async function createPostText(topic, isFakeNews) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    // TODO: use this?
    // systemInstruction: "You are a very dumb person.",
    temperature: 2.0,
  });

  let options = "";

  if (isFakeNews) {
    options = options + " It should be a fictious story about real people.";
  }

  // TODO: remove this?
  let topicPrompt = `Provide me with a specific topic from the news or social media, about ${topic}, that can serve as inspiration for a social media post. ${options}. Don't explain it, just give me the content.`;
  let topicContent = await model.generateContent(topicPrompt);
  console.log(`\nResponse 1: ${topicContent.response.text()}`);

  let postPrompt = `Social media post inspired on this text: "${topicContent.response.text()}". Just one option. Include some emoji. Don't explain it, just give me the content.`;
  let postContent = await model.generateContent(postPrompt);
  console.log(`\nResponse 1: ${topicContent.response.text()}`);

  const postText = cleanUpPost(postContent.response.text());
  return postText;
}

async function editText(originalPostText) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    temperature: 2.0,
  });
  const postPrompt = `Write a small text that digrees with this one: "${originalPostText}".`;
  const postContent = await model.generateContent(postPrompt);
  const postText = postContent.response.text();

  console.log(postText);

  return cleanUpPost(postText);
}

async function createCommentText(postText, tone = undefined) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    // TODO: use this?
    // systemInstruction: "You are a very dumb person.",
    temperature: 2.0,
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

async function createCommentReply(postText, postCommentText) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    temperature: 2.0,
  });

  const commentPrompt = `Small social media comment responding in a confrontational manner to this comment: "${postCommentText}", made on this social media post: "${postText}". Just one option. Include some emoji. Don't explain it, just give me the content.`;
  const commentContent = await model.generateContent(commentPrompt);
  const commentText = cleanUpPost(commentContent.response.text());

  console.log(commentText);

  return commentText;
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

  // Remove explanations of content
  // str = str.split(": ", 1)[1];

  // Split the string into an array of lines
  const lines = str.split("\n");
  // Filter out empty lines
  const nonEmptyLines = lines.filter((line) => line.trim() !== "");

  // Filter out lines that contain the specified content
  const filteredLines = nonEmptyLines.filter(
    (line) => !line.includes("Okay, here's a")
  );

  // Join the filtered lines back into a single string
  str = filteredLines.join("\n");

  // Remove explanations of content
  // str = str.split(": ", 1)[1];

  // remove quotes
  str = str.replace(/['"]/g, "");

  return str;
}

async function mockImage(imagePath) {
  const description = await describeImage(imagePath);

  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    temperature: 2.0,
  });

  const prompt = `Create a small text making fun of an image described in this manner: ${description}. Don't explain it, just give me the content.`;
  const content = await model.generateContent(prompt);
  const mockingText = content.response.text();

  console.log("");
  console.log(mockingText);

  return cleanUpPost(mockingText);
}

async function mockPost(originalText, imagePath) {
  const description = await describeImage(imagePath);

  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    temperature: 2.0,
  });

  const prompt = `Create a small text making fun of a social media post with the following text: "${originalText}" and with an associated image described in this manner: "${description}". Don't explain it, just give me the content.`;
  const content = await model.generateContent(prompt);
  const mockingText = content.response.text();

  console.log("");
  console.log(mockingText);

  return cleanUpPost(mockingText);
}

export {
  createPostText,
  editText,
  createCommentText,
  createCommentReply,
  cleanUpPost,
  mockImage,
  mockPost,
};
