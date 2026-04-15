import dotenv from 'dotenv';
import path from 'path';
import sqlite3 from 'sqlite3';
import { encode } from 'html-entities';

import { generateImage, editImage, resizeImage, cropAndResizeToThumbnail } from './image_creator.js';
import { getRandomElement, getRandomBoolean, getRandomUserIdFromDB } from '../server/utils.js';
import {
  createPostText,
  createCommentText,
  cleanUpPost,
  mockImage,
  editText,
  createPsyopPostText,
  createPsyopCommentText,
  createPsyopDemolisherReply,
} from '../server/text_creator.js';

// Orchestrates post generation pipelines used by server/app.mjs routes:
// - /create_bot_post -> createAIPost
// - /create_human_post -> createHumanPost
// - /create_psyop_post -> createPsyopPost

const db = new sqlite3.Database('./server/data/nexyDB.sqlite');
const uploadsRoot = path.join(path.resolve(), 'server/data/uploads');
const postImagesDir = path.join(uploadsRoot, 'post_images');
const postThumbnailsDir = path.join(uploadsRoot, 'thumbnails/post_images');

// Generate a random alphanumeric GUID with specified length
function generateGUID(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < length; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

// Load environment variables from .env file
dotenv.config();

// AI client is handled in text_creator.js and image_creator.js

const serious_topics = [
  'Economy',
  'Sports',
  'Politics',
  'World News',
  'Business',
  'Technology',
  'Health',
  'Entertainment',
  'Lifestyle',
  'Opinion',
  'Science',
  'Immigration',
  'Education',
  'Weather',
];

const lightTopics = ['some music celebrity', 'some TV celebrity', 'some movie celebrity', 'some sports celebrity'];

function removeHashtags(text) {
  return text.replace(/#[\w-]+/g, '').trim();
}

function removeEmojis(text) {
  return text.replace(/[\u{1F600}-\u{1F64F}]/gu, '').trim();
}

async function createAIPost({
  userId = undefined,
  topic = undefined,
  isFakeNews = undefined,
  numComments = undefined,
}) {
  // If caller does not force a user, pick one bot account from DB.
  if (userId === undefined) {
    userId = await getRandomUserIdFromDB();
  }

  if (topic === undefined || topic === '') {
    // Balance betwen 50% light and 50% serious topics.
    let random_index = Math.floor(Math.random() * 2);
    let topic_list = random_index === 0 ? serious_topics : lightTopics;
    topic = getRandomElement(topic_list);
  }

  if (isFakeNews === undefined) {
    isFakeNews = getRandomBoolean();
  }

  console.log(`Topic: ${topic}`);

  // Text generation and image generation are intentionally decoupled:
  // text comes first, then image prompt is derived from sanitized text.
  const postText = await createPostText(topic, isFakeNews);

  console.log('\nCaption:');
  console.log(postText);

  // Pre-generate postId so DB id and image filename stay aligned (<id>.png).
  const provisionalPostId = generateGUID(11);
  await generateImage(
    `Create a amateur-looking square photo inspired by this text: "${removeEmojis(removeHashtags(postText))}". 
    The photo should look like it was taken casually with a smartphone by a regular person, 
    slightly imperfect framing, natural lighting, not too much saturation, no professional editing or filters.`,
    provisionalPostId
  );

  // If not defined, create between 1 and 7 comments.
  if (numComments === undefined || isNaN(Number(numComments)) || numComments === '' || numComments === null) {
    numComments = Math.floor(Math.random() * 7) + 1;
  } else {
    numComments = Number(numComments);
  }

  // Persist with required bot metadata defaults using the same provisional id.
  const postId = await savePost(
    userId,
    postText,
    { countryCode: 'US', languageCode: 'EN', sourceType: 'bot' },
    provisionalPostId
  );

  // Auto-seed the thread with synthetic comments for feed realism.
  for (let i = 0; i < numComments; i++) {
    const commentText = cleanUpPost(await createCommentText(postText));

    console.log('\nComment:');
    console.log(commentText);

    const commentUserId = await getRandomUserIdFromDB();
    await saveComment(postId, commentUserId, commentText, 'bot');
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
    // forcedPostId is used when the image already exists under a known id.
    const postId = forcedPostId || generateGUID(11); // becomes primary key id
    const query =
      'INSERT INTO posts (id, userId, postText, createdAt, countryCode, languageCode, sourceType) VALUES (?, ?, ?, ?, ?, ?, ?)';

    db.run(query, [postId, userId, postText, createdAt, countryCode, languageCode, sourceType], function (err) {
      if (err) {
        console.error(err.message);
        reject(err);
      } else {
        console.log(`Post created with id: ${postId}`);
        resolve(postId);
      }
    });
  });
}

async function saveComment(postId, userId, commentText, sourceType = null) {
  return new Promise((resolve, reject) => {
    const createdAt = new Date().toISOString();
    // Keep one helper for both legacy rows (without sourceType) and new rows.
    const query = sourceType
      ? 'INSERT INTO comments (postId, userId, commentText, createdAt, sourceType) VALUES (?, ?, ?, ?, ?)'
      : 'INSERT INTO comments (postId, userId, commentText, createdAt) VALUES (?, ?, ?, ?)';

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

async function createHumanPost(userId, postText, originalImageFileName) {
  const createdAt = new Date().toISOString();

  try {
    // Validate input
    if (!userId || !postText) {
      throw new Error('User ID and post text are required.');
    }

    // Escape user input to prevent XSS injection
    const escapedPostText = encode(postText);

    // Human posts are intentionally transformed into a "replying/disagreeing" style.
    let editedPostText = await editText(escapedPostText);

    let originalImagePath = null;
    let mockingImageText = null;
    if (originalImageFileName) {
      originalImagePath = path.join(postImagesDir, originalImageFileName);

      // Normalize uploaded image size before any AI or thumbnail pipeline step.
      try {
        await resizeImage(originalImageFileName, postImagesDir, postImagesDir, null, 1080, null);
      } catch (error) {
        throw new Error('Failed to resize the image.', { cause: error });
      }

      // Generate optional extra text based on image contents.
      try {
        mockingImageText = await mockImage(originalImagePath);
      } catch (error) {
        throw new Error('Failed to mock the image.', { cause: error });
      }
    }

    if (mockingImageText) {
      editedPostText = editedPostText + '</br>' + mockingImageText;
    }

    // Pre-generate postId so edited image and DB row use the same id base.
    const postId = generateGUID(11);
    const editedImageFileName = `${postId}.png`;
    const editedImagePath = path.join(postImagesDir, editedImageFileName);

    // Edit the image and save it
    try {
      await editImage(originalImagePath, editedImagePath);
    } catch (error) {
      throw new Error('Failed to edit the image: ' + error.message, { cause: error });
    }

    // Create thumbnail for the edited image

    const fileNameWithoutExt = path.parse(editedImageFileName).name;
    const fileExt = path.extname(editedImageFileName);
    const thumbnailFileName = `${fileNameWithoutExt}-thumbnail${fileExt}`;

    try {
      await cropAndResizeToThumbnail(editedImageFileName, postImagesDir, postThumbnailsDir, thumbnailFileName, 200);
    } catch (error) {
      throw new Error('Failed to create a thumbnail for the image.', { cause: error });
    }

    // Save post as sourceType=human for downstream moderation/analytics splits.
    return new Promise((resolve, reject) => {
      const query =
        'INSERT INTO posts (id, userId, postText, createdAt, countryCode, languageCode, sourceType) VALUES (?, ?, ?, ?, ?, ?, ?)';
      db.run(
        query,
        [
          postId,
          userId,
          editedPostText,
          createdAt,
          'US', // countryCode default for human post
          'EN', // languageCode default for human post
          'human', // sourceType
        ],
        function (err) {
          if (err) {
            reject(new Error('Failed to save the post to the database.'));
          } else {
            resolve({ postId });
          }
        }
      );
    });
  } catch (error) {
    console.error('Error in createHumanPost:', error.message);
    throw error; // Re-throw the error to handle it in the calling function
  }
}

async function createPsyopPost({ objective, target = 'general public', strategy = 'White' }) {
  // PsyOp flow mirrors createAIPost but uses dedicated prompt families.
  const userId = await getRandomUserIdFromDB();

  const postText = await createPsyopPostText(objective, target, strategy);
  console.log('\nPsyOp caption:', postText);

  const provisionalPostId = generateGUID(11);
  await generateImage(
    `Create an amateur-looking square image that could accompany this social media post: ` +
      `"${removeEmojis(removeHashtags(postText))}". ` +
      `The image should look like it was taken casually with a smartphone by a regular person, ` +
      `slightly imperfect framing, natural lighting, not too much saturation, no professional editing or filters.`,
    provisionalPostId
  );

  const numComments = Math.floor(Math.random() * 7) + 1;
  const postId = await savePost(
    userId,
    postText,
    { countryCode: 'US', languageCode: 'EN', sourceType: 'bot' },
    provisionalPostId
  );

  for (let i = 0; i < numComments; i++) {
    const { text: commentText, type: commentType } = await createPsyopCommentText(postText, objective);
    const commentUserId = await getRandomUserIdFromDB();
    await saveComment(postId, commentUserId, commentText, 'bot');

    console.log(`\nPsyOp comment (${commentType}):`);
    console.log(commentText);

    // Inject counter-reply when strawman text is generated to shape thread tone.
    if (commentType === 'strawman_opposition') {
      const replyText = await createPsyopDemolisherReply(postText, commentText, objective, commentUserId);
      const replyUserId = await getRandomUserIdFromDB();
      await saveComment(postId, replyUserId, replyText, 'bot');

      console.log('\nPsyOp demolisher reply:');
      console.log(replyText);
    }
  }

  console.log(`PsyOp post created with id: ${postId}`);
  return postId;
}

export { createAIPost, createHumanPost, createPsyopPost };
