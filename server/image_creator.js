import fs from 'fs';
import { Buffer } from 'buffer';
import dotenv from 'dotenv';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';
import OpenAI, { toFile } from 'openai';
import { Image } from 'image-js';
import sharp from 'sharp';

// Load environment variables from .env file
dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Define __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsRoot = path.join(__dirname, '../server/data/uploads');
const postImagesDir = path.join(uploadsRoot, 'post_images');
const postThumbnailsDir = path.join(uploadsRoot, 'thumbnails/post_images');
const profilePicturesDir = path.join(uploadsRoot, 'profile_pictures');
const profileThumbnailsDir = path.join(uploadsRoot, 'thumbnails/profile_pictures');

function isSafetyRejection(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('rejected by the safety system') || message.includes('content_policy_violation');
}

// Caller should provide a stable 11-char postId to use as base filename
async function generateImage(contents, postId) {
  try {
    const image = await openai.images.generate({
      model: 'gpt-image-1.5',
      prompt: typeof contents === 'string' ? contents : String(contents),
      size: '1024x1024',
      quality: 'low',
    });

    const imageData = image.data?.[0]?.b64_json;
    if (!imageData) {
      throw new Error('OpenAI API did not return an image.');
    }

    const buffer = Buffer.from(imageData, 'base64');
    const safeId = postId || Date.now().toString();
    const imageFileName = safeId + '.png';

    fs.mkdirSync(postImagesDir, { recursive: true });
    const imagePath = path.join(postImagesDir, imageFileName);

    fs.writeFileSync(imagePath, buffer);
    console.log(`Image saved as ${imageFileName}`);

    const fileExt = path.extname(imageFileName);
    const thumbnailFileName = `${safeId}-thumbnail${fileExt}`;

    await cropAndResizeToThumbnail(imageFileName, postImagesDir, postThumbnailsDir, thumbnailFileName, 200, null);

    return imageFileName;
  } catch (error) {
    console.error('Error generating content:', error);
    throw error;
  }
}

async function editImage(inputImagePath, outputImagePath) {
  const tempPngInputPath = `${outputImagePath}.edit-input.png`;
  try {
    // Ensure input is PNG for the edit endpoint.
    await sharp(inputImagePath).png().toFile(tempPngInputPath);

    const pngBuffer = fs.readFileSync(tempPngInputPath);
    const pngFile = await toFile(pngBuffer, 'image.png', { type: 'image/png' });

    const response = await openai.images.edit({
      model: 'gpt-image-1.5',
      image: pngFile,
      prompt: `Add a pigeon to the image.
              Preserve the entire original photo exactly. 
              Keep lighting, shadows, and all textures unchanged.
              Blend the new object realistically without modifying anything else.`,
      size: '1024x1024',
      quality: 'low',
    });

    const imageData = response.data?.[0]?.b64_json;
    if (!imageData) {
      throw new Error('OpenAI image edit did not return image data.');
    }

    const buffer = Buffer.from(imageData, 'base64');
    fs.writeFileSync(outputImagePath, buffer);
    if (inputImagePath !== outputImagePath && fs.existsSync(inputImagePath)) {
      fs.unlinkSync(inputImagePath);
    }
    console.log(`Image saved as ${outputImagePath}`);
  } catch (error) {
    if (isSafetyRejection(error) && inputImagePath) {
      // If edit is blocked, keep workflow running by using the original image.
      await sharp(inputImagePath).png().toFile(outputImagePath);
      console.warn('Image edit rejected by safety system; using original image instead.');
      return;
    }
    console.error('Error generating content:', error);
    throw error;
  } finally {
    if (fs.existsSync(tempPngInputPath)) {
      fs.unlinkSync(tempPngInputPath);
    }
  }
}

async function createUserImage(userId, fullName, description) {
  const contents = `Create a realistic square photo of a person to be used as a social media profile picture. 
  It should look like a casual, everyday selfie or photo taken with a smartphone — not a professional headshot. 
  Slightly imperfect framing, natural lighting, no filters or heavy editing. The person should look like a normal, average person.
  Not pretty. Just a believable, ordinary profile picture that could belong to a real user.
  Pick a random age (16 to 100 years of age).
  Pick a random ethnicity not always white.
  Pick some random outfit with random color, by some reason you always tend to go with khaki/green, don't do it.
  Pick a random background that would be typical for a profile picture, but keep it simple and realistic.
  The name of the person is ${fullName}. Use this bio as inspiration: "${description}".`;

  try {
    const image = await openai.images.generate({
      model: 'gpt-image-1.5',
      prompt: contents,
      size: '1024x1024',
      quality: 'low',
    });

    const imageData = image.data?.[0]?.b64_json;
    if (!imageData) {
      throw new Error('OpenAI API did not return an image.');
    }

    const buffer = Buffer.from(imageData, 'base64');
    const imageFileName = userId + '.png';

    fs.mkdirSync(profilePicturesDir, { recursive: true });
    const imagePath = path.join(profilePicturesDir, imageFileName);

    fs.writeFileSync(imagePath, buffer);
    console.log(`Image saved as ${imageFileName}`);

    const thumbnailFileName = `${userId}-thumbnail.png`;
    await resizeImage(imageFileName, profilePicturesDir, profileThumbnailsDir, thumbnailFileName, 200, null);

    return imageFileName;
  } catch (error) {
    console.error('Error generating content:', error);
    throw error;
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

  await pipeline.resize(thumbnailSize, thumbnailSize, { fit: 'cover', position: 'centre' }).toFile(outputFilePath);
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
      throw new Error('Either width or height must be provided.');
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

async function describeImage(imagePath) {
  const base64 = Buffer.from(fs.readFileSync(imagePath)).toString('base64');
  const response = await openai.responses.create({
    model: 'gpt-4.1-mini',
    input: [
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: 'Describe this image.',
          },
          {
            type: 'input_image',
            image_url: `data:image/jpeg;base64,${base64}`,
          },
        ],
      },
    ],
  });

  console.log(response.output_text);

  return response.output_text || '';
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

// resizeImages("./public/images", "./data/thumbnails/images", 200, 200);

/*
The strange thing is that they happen randomly. I am sure I am not hitting the rate limits or any other networking restrictions.

What worked for me—I’ve wrapped Gemini’s calls (like sendMessage and generateContent) with this simple withRetry function: withRetry.js · GitHub



cropAndResizeToThumbnail(
  "dec98590-23b4-42b9-80fa-0a21110d5779.png",
  "./data/images",
  "./data/thumbnails/post_images"
);
*/
