import fs from "fs";
import { Buffer } from "buffer";
import dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import process from "process";
import { fileURLToPath } from "url";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Image } from "image-js";
import sharp from "sharp";

// Load environment variables from .env file
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Define __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateImage(contents) {
  // Set responseModalities to include "Image" so the model can generate  an image
  const model = genAI.getGenerativeModel({
    // model: "gemini-2.0-flash-exp-image-generation",
    model: "gemini-2.0-flash-preview-image-generation",
    generationConfig: {
      responseModalities: ["Text", "Image"],
      temperature: 2.0,
    },
  });

  try {
    const response = await model.generateContent(contents);
    let foundImage = false;
    for (const part of response.response.candidates[0].content.parts) {
      if (part.text) {
        console.log(part.text);
      } else if (part.inlineData) {
        foundImage = true;
        const imageData = part.inlineData.data;
        const buffer = Buffer.from(imageData, "base64");

        const uuid = uuidv4();
        const imageFileName = uuid + ".png";

        const imagePath = path.join(__dirname, "../data/images", imageFileName);

        fs.writeFileSync(imagePath, buffer);
        console.log(`Image saved as ${imageFileName}`);

        const fileExt = path.extname(imageFileName);
        const thumbnailFileName = `${uuid}-thumbnail${fileExt}`;

        await cropAndResizeToThumbnail(
          imageFileName,
          "./data/images",
          "./data/thumbnails/images",
          thumbnailFileName,
          200,
          null
        );

        return imageFileName;
      }
    }
    if (!foundImage) {
      throw new Error("Gemini API did not return an image.");
    }
  } catch (error) {
    console.error("Error generating content:", error);
    throw error;
  }
}

// TODO: remove the input image
async function editImage(inputImagePath, outputImagePath) {
  const imageData = fs.readFileSync(inputImagePath);
  const base64Image = imageData.toString("base64");

  const contents = [
    {
      text: "Add some piegon to this image.",
    },
    {
      inlineData: {
        mimeType: "image/jpeg",
        data: base64Image,
      },
    },
  ];

  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash-preview-image-generation",
    generationConfig: {
      responseModalities: ["Text", "Image"],
    },
    temperature: 2.0,
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

async function createUserImage(userId, fullName, description) {
  // Set responseModalities to include "Image" so the model can generate  an image
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash-preview-image-generation",
    generationConfig: {
      responseModalities: ["Text", "Image"],
    },
    temperature: 2.0,
  });

  const contents = `Create a realistic square photo of a person. The photo is to be used on a social media profile. The name of the person is ${fullName}. Use this bio as inspiration: "${description}".`;
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

        const imageFileName = userId + ".png";

        const imagePath = path.join(
          __dirname,
          "../data/profile_pictures",
          imageFileName
        );

        fs.writeFileSync(imagePath, buffer);
        console.log(`Image saved as ${imageFileName}`);

        const thumbnailFileName = `${userId}-thumbnail.png`;

        await resizeImage(
          imageFileName,
          "./data/profile_pictures",
          "./data/thumbnails/profile_pictures",
          thumbnailFileName,
          200,
          null
        );

        return imageFileName;
      }
    }
  } catch (error) {
    console.error("Error generating content:", error);
  }
}

async function resizeImages(inputFolder, outputFolder, width, height) {
  // Ensure the output folder exists
  if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder, { recursive: true });
  }

  // Read all files in the input folder
  const files = fs.readdirSync(inputFolder);

  for (const imageFileName of files) {
    // Skip non-image files
    if (!/\.(jpg|jpeg|png|gif)$/i.test(imageFileName)) {
      continue;
    }
    // Resize the image

    resizeImage(imageFileName, inputFolder, outputFolder, null, width, height);
  }
}

async function cropAndResizeToThumbnail(
  inputFileName,
  inputFolder,
  outputFolder,
  outputFileName = null,
  thumbnailSize = 200
) {
  // Ensure the output folder exists
  if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder, { recursive: true });
  }
  const inputFilePath = path.join(inputFolder, inputFileName);

  if (outputFileName === null) {
    outputFileName = inputFileName;
  }

  const outputFilePath = path.join(outputFolder, outputFileName);

  // Use sharp to crop to square and then resize
  const image = sharp(inputFilePath).ensureAlpha();
  const metadata = await image.metadata();

  let size = Math.min(metadata.width, metadata.height);
  let left = Math.floor((metadata.width - size) / 2);
  let top = Math.floor((metadata.height - size) / 2);

  // Defensive: if image is already square, skip extract
  let pipeline = image;
  if (metadata.width !== metadata.height) {
    pipeline = pipeline.extract({ left, top, width: size, height: size });
  }

  await pipeline
    .resize(thumbnailSize, thumbnailSize, { fit: "cover", position: "centre" })
    .toFile(outputFilePath);
}

async function resizeImage(
  inputFileName,
  inputFolder,
  outputFolder,
  outputFileName = null,
  width = null,
  height = null
) {
  // Ensure the output folder exists
  if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder, { recursive: true });
  }
  const inputFilePath = path.join(inputFolder, inputFileName);

  if (outputFileName === null) {
    outputFileName = inputFileName;
  }

  const outputFilePath = path.join(outputFolder, outputFileName);

  try {
    // Load the image
    const image = await Image.load(inputFilePath);

    // Calculate the missing dimension while retaining the aspect ratio
    if (width && !height) {
      height = Math.round((image.height / image.width) * width);
    } else if (height && !width) {
      width = Math.round((image.width / image.height) * height);
    } else if (!width && !height) {
      throw new Error("Either width or height must be provided.");
    }

    // Resize the image
    const resizedImage = image.resize({ width, height });

    // Save the resized image
    await resizedImage.save(outputFilePath);
    console.log(`Resized and saved: ${outputFilePath}`);
  } catch (error) {
    console.error(`Failed to process ${inputFileName}:`, error);
  }
}

// Converts local file information to base64
function fileToGenerativePart(path, mimeType) {
  return {
    inlineData: {
      data: Buffer.from(fs.readFileSync(path)).toString("base64"),
      mimeType,
    },
  };
}

async function describeImage(imagePath) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const prompt = "Describe this image.";

  const imageParts = [fileToGenerativePart(imagePath, "image/jpg")];

  const generatedContent = await model.generateContent([prompt, ...imageParts]);

  console.log(generatedContent.response.text());

  return generatedContent.response.text();
}

export {
  createUserImage,
  generateImage,
  editImage,
  resizeImage,
  resizeImages,
  describeImage,
  cropAndResizeToThumbnail,
};

// editImage("C:/Users/joao-carloto/Downloads/img_2.jpg", "edited.png");

// resizeImages("./data/images", "./data/thumbnails/images", 200, 200);

/*
The strange thing is that they happen randomly. I am sure I am not hitting the rate limits or any other networking restrictions.

What worked for me—I’ve wrapped Gemini’s calls (like sendMessage and generateContent) with this simple withRetry function: withRetry.js · GitHub



cropAndResizeToThumbnail(
  "dec98590-23b4-42b9-80fa-0a21110d5779.png",
  "./data/images",
  "./data/thumbnails/images"
);
*/
