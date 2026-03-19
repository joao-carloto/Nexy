import dotenv from 'dotenv';
import process from 'process';
import { getRandomElement } from './utils.js';
import OpenAI from 'openai';
import { describeImage } from './image_creator.js';

// Load environment variables from .env file
dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const tones = ['positive', 'neutral', 'negative'];

async function createPostText(topic, isFakeNews) {
  const model = 'gpt-4.1-mini';

  let options = '';

  if (isFakeNews) {
    options = options + ' It should be a fictious story about real people.';
  }

  // TODO: remove this?
  let topicPrompt = `Provide me with a specific topic from the news or social media, about ${topic}, 
  that can serve as inspiration for a social media post. ${options}. Don't explain it, just give me the content.`;
  let topicText = await generateText(topicPrompt, model);
  console.log(`\nResponse 1: ${topicText}`);

  let postPrompt = `Social media post inspired on this text: "${topicText}". Just one option. Include some emoji. 
  Don't explain it, just give me the content.`;
  let postTextRaw = await generateText(postPrompt, model);
  console.log(`\nResponse 2: ${postTextRaw}`);

  const postText = cleanUpPost(postTextRaw);
  return postText;
}

async function editText(originalPostText) {
  const model = 'gpt-4.1-mini';
  const postPrompt = `Write a small text that digrees with this one: "${originalPostText}".`;
  const postText = await generateText(postPrompt, model);

  console.log(postText);

  return cleanUpPost(postText);
}

async function createCommentText(postText, tone = undefined) {
  const model = 'gpt-4.1-mini';
  let options = '';
  // If not defined, pick a tone.
  if (tone === undefined) {
    tone = getRandomElement(tones);
  }
  options = options + ` The comment should have a ${tone} tone.`;
  const commentPrompt = `Small social media comment responding to ${postText}. 
  Just one option. Include some emoji.${options} Don't explain it, just give me the content.`;
  const commentText = await generateText(commentPrompt, model);
  return commentText;
}

async function createCommentReply(postText, postCommentText) {
  const model = 'gpt-4.1-mini';

  const commentPrompt = `Small social media comment, responding in a confrontational manner,
   to this comment: "${postCommentText}", made on this social media post: "${postText}". 
   Just one option. Include some emoji. Don't explain it, just give me the content.`;
  const commentText = cleanUpPost(await generateText(commentPrompt, model));

  console.log(commentText);

  return commentText;
}

function cleanUpPost(str) {
  // Somel regex cleanup
  str = str.replace(/\*\*.*?\*\*/g, '');
  str = str.replace(/\[.*?\]/g, '');

  str = str.replace(/^(Image:.*?\.)(\s|$)/, '');
  str = str.replace(/^(Option.*?:)(\s|$)/, '');
  str = str.replace(/^(Option.*?:)(\s|$)/, '');
  str = str.replace(/.*social media post:/, '');

  str = str.replace(/Okay, here's one: /, '');
  str = str.replace(/Okay, here's one option: /, '');

  // Remove explanations of content
  // str = str.split(": ", 1)[1];

  // Split the string into an array of lines
  const lines = str.split('\n');
  // Filter out empty lines
  const nonEmptyLines = lines.filter((line) => line.trim() !== '');

  // Filter out lines that contain the specified content
  const filteredLines = nonEmptyLines.filter((line) => !line.includes("Okay, here's a"));

  // Join the filtered lines back into a single string
  str = filteredLines.join('\n');

  // Remove explanations of content
  // str = str.split(": ", 1)[1];

  // remove quotes
  str = str.replace(/['"]/g, '');

  return str;
}

async function mockImage(imagePath) {
  const description = await describeImage(imagePath);
  const model = 'gpt-4.1-mini';

  const prompt = `Create a small text making fun of an image described in this manner: ${description}.
   Don't explain it, just give me the content.`;
  const mockingText = await generateText(prompt, model);

  console.log('');
  console.log(mockingText);

  return cleanUpPost(mockingText);
}

async function mockPost(originalText, imagePath) {
  const description = await describeImage(imagePath);
  const model = 'gpt-4.1-mini';

  const prompt = `Create a small text making fun of a social media post with the following text: "${originalText}"
   and with an associated image described in this manner: "${description}". Don't explain it, just give me the content.`;
  const mockingText = await generateText(prompt, model);

  console.log('');
  console.log(mockingText);

  return cleanUpPost(mockingText);
}

async function generateText(prompt, model = 'gpt-4.1-mini') {
  const response = await openai.responses.create({
    model,
    input: prompt,
  });

  if (response.output_text) {
    return response.output_text;
  }

  return '';
}

async function createPsyopPostText(objective, target, strategy) {
  const model = 'gpt-4.1-mini';

  const strategyGuide = {
    White:
      'Use only truthful and verifiable information. The source and intent may be transparent. ' +
      'The post should be credible and persuasive while remaining factually accurate.',
    Grey:
      'The source should be ambiguous or implied, never stated. Information may be technically true ' +
      'but selectively framed to advance the objective. Use strategic omissions and emotional framing ' +
      'without outright lying.',
    Black:
      'The post should appear completely organic and authentic while spreading misleading or false ' +
      'information that advances the objective. The true intent must be entirely hidden. ' +
      'Use emotional manipulation, fabricated context, or disinformation as needed.',
  };

  const guide = strategyGuide[strategy] || strategyGuide['White'];

  const prompt =
    `You are crafting a social media post as part of a psychological operation (PsyOp).\n\n` +
    `Objective: ${objective}\n` +
    `Target audience: ${target}\n` +
    `Strategy: ${strategy} — ${guide}\n\n` +
    `Write a single realistic social media post that achieves the objective above, ` +
    `is specifically crafted for the described audience, and follows the ${strategy} strategy. ` +
    `Include relevant emojis. Make it feel completely natural, as if written by a real person. ` +
    `Output only the post text with no explanation or commentary.`;

  const postTextRaw = await generateText(prompt, model);
  console.log(`\nPsyOp Post (${strategy}): ${postTextRaw}`);
  return cleanUpPost(postTextRaw);
}

export { createPostText, editText, createCommentText, createCommentReply, cleanUpPost, mockImage, createPsyopPostText };
