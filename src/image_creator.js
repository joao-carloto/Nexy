import fs from "fs";
import { Buffer } from "buffer";
import dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import process from "process";
import { fileURLToPath } from "url";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Image } from "image-js";

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
    model: "gemini-2.0-flash-exp-image-generation",
    generationConfig: {
      responseModalities: ["Text", "Image"],
      temperature: 2.0,
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

        await resizeImage(
          imageFileName,
          "./data/images",
          "./data/thumbnails/images",
          200,
          200
        );

        return imageFileName;
      }
    }
  } catch (error) {
    console.error("Error generating content:", error);
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

async function createUserImage(inspirationText) {
  // Set responseModalities to include "Image" so the model can generate  an image
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash-exp-image-generation",
    generationConfig: {
      responseModalities: ["Text", "Image"],
    },
    temperature: 2.0,
  });

  const contents = `Create a realistic square photo of a person. The photo is to be used on a social media profile. Use this as inspiration: "${inspirationText}".`;
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

        await resizeImage(
          imageFileName,
          "./data/profile_pictures",
          "./data/thumbnails/profile_pictures",
          200,
          200
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

  for (const file of files) {
    // Skip non-image files
    if (!/\.(jpg|jpeg|png|gif)$/i.test(file)) {
      continue;
    }
    // Resize the image
    resizeImage(file, inputFolder, outputFolder, width, height);
  }
}

async function resizeImage(file, inputFolder, outputFolder, width, height) {
  // Ensure the output folder exists
  if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder, { recursive: true });
  }
  const inputFilePath = path.join(inputFolder, file);

  const fileNameWithoutExt = path.parse(file).name;
  const fileExt = path.extname(file);
  const thumbnailFileName = `${fileNameWithoutExt}-thumbnail${fileExt}`;
  const outputFilePath = path.join(outputFolder, thumbnailFileName);

  try {
    // Load the image
    const image = await Image.load(inputFilePath);

    // Resize the image
    const resizedImage = image.resize({ width, height });

    // Save the resized image
    await resizedImage.save(outputFilePath);
    console.log(`Resized and saved: ${outputFilePath}`);
  } catch (error) {
    console.error(`Failed to process ${file}:`, error);
  }
}

/*
resizeImage(
  "0b499181-f7a7-4ca7-88a2-88127468b8e9.png",
  "./data/images",
  "./data/thumbnails/images",
  150,
  150
);
*/

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

  const imageParts = [fileToGenerativePart(imagePath, "image/png")];

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
};

/*
editImage(
  "C:\\Users\\joao-carloto\\Pictures\\unnamed - Copy.png",
  "edited.png"
);
*/

// resizeImages("./data/images", "./data/thumbnails/images", 200, 200);
