import dotenv from 'dotenv';
import { encode } from 'html-entities';
import { getRandomElement } from './utils.js';
import { describeImage } from './image_creator.js';
import { getOpenAI } from './openai_client.mjs';

// Load environment variables from .env file
dotenv.config();

const tones = ['positive', 'neutral', 'negative'];

// Centralized prompt + cleanup helpers for post/comment text used by server routes.

// PT locale must always resolve to European Portuguese, not PT-BR — the target audience is Portugal.
function languageInstructionFor(locale) {
  return locale === 'pt'
    ? ' Respond only in European Portuguese (Portugal Portuguese, not Brazilian Portuguese).'
    : ' Respond only in English.';
}

// Heuristic check for Portuguese-language input (accented PT letters or common PT stopwords),
// used where no explicit locale is available (e.g. PsyOp inputs) to decide whether to force PT-PT.
function looksLikePortuguese(text) {
  if (!text) return false;
  if (/[ãõçáéíóúâêô]/i.test(text)) return true;
  return /\b(de|para|que|não|com|uma|este|esta|são)\b/i.test(text);
}

// Same PT-PT enforcement as languageInstructionFor, but derived from free-text input instead
// of an explicit locale — for callers (PsyOp, mockPost) that have no locale parameter.
function languageInstructionFromText(...texts) {
  const isPt = texts.some(looksLikePortuguese);
  return isPt ? languageInstructionFor('pt') : '';
}

async function createPostText(topic, isFakeNews, locale = 'en') {
  const model = 'gpt-4.1-mini';

  let options = '';

  if (isFakeNews) {
    options = options + ' It should be a fictious story about real people.';
  }

  const languageInstructions = languageInstructionFor(locale);

  // Two-step generation: first an inspiration snippet, then final user-facing post.
  let topicPrompt = `Provide me with a specific topic from the news or social media, about ${topic}, 
  that can serve as inspiration for a social media post. ${options}. ${languageInstructions} Don't explain it, just give me the content.`;
  let topicText = await generateText(topicPrompt, model);
  console.log(`\nResponse 1: ${topicText}`);

  let postPrompt = `Social media post inspired on this text: "${topicText}". Just one option. Include some emoji. 
  ${languageInstructions} Don't explain it, just give me the content.`;
  let postTextRaw = await generateText(postPrompt, model);
  console.log(`\nResponse 2: ${postTextRaw}`);

  const postText = cleanUpPost(postTextRaw);
  return postText;
}

async function editText(originalPostText, locale = 'en') {
  const model = 'gpt-4.1-mini';
  // Used by createHumanPost to intentionally change the original author tone.
  // Generate in the user's selected language to maintain linguistic consistency.
  const postPrompt = `Write a small text that disagrees with this one: "${originalPostText}".${languageInstructionFor(locale)} Keep the response concise and natural for social media.`;
  const postText = await generateText(postPrompt, model);

  console.log(postText);

  return cleanUpPost(postText);
}

async function createCommentText(postText, tone = undefined, locale = 'en') {
  const model = 'gpt-4.1-mini';
  let options = '';
  // If not defined, pick a tone for variability in generated threads.
  if (tone === undefined) {
    tone = getRandomElement(tones);
  }
  options = options + ` The comment should have a ${tone} tone.`;

  const languageInstructions = languageInstructionFor(locale);

  const commentPrompt = `Small social media comment responding to ${postText}.
  Just one option. Include some emoji.${options}${languageInstructions} Don't explain it, just give me the content.`;
  const commentText = await generateText(commentPrompt, model);
  return commentText;
}

async function createCommentReply(postText, postCommentText, locale = 'en') {
  const model = 'gpt-4.1-mini';

  const languageInstructions = languageInstructionFor(locale);

  const commentPrompt = `Small social media comment, responding in a confrontational manner,
   to this comment: "${postCommentText}", made on this social media post: "${postText}". 
   Just one option. Include some emoji.${languageInstructions} Don't explain it, just give me the content.`;
  const commentText = cleanUpPost(await generateText(commentPrompt, model));

  console.log(commentText);

  return commentText;
}

function cleanUpPost(str) {
  // Best-effort normalization for common LLM wrappers and formatting artifacts.
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

async function mockImage(imagePath, locale = 'en') {
  // Image-to-text caption is generated first, then converted to short mocking text.
  // Pass locale so description is generated in the appropriate language.
  const description = await describeImage(imagePath, locale);
  const model = 'gpt-4.1-mini';

  const prompt = `Create a small text making fun of an image described in this manner: ${description}.${languageInstructionFor(locale)} Keep it concise and natural for social media. Don't explain it, just give me the content.`;
  const mockingText = await generateText(prompt, model);

  console.log('');
  console.log(mockingText);

  return cleanUpPost(mockingText);
}

async function mockPost(originalText, imagePath) {
  const description = await describeImage(imagePath);
  const model = 'gpt-4.1-mini';

  const languageInstructions = languageInstructionFromText(originalText);

  const prompt = `Create a small text making fun of a social media post with the following text: "${originalText}"
   and with an associated image described in this manner: "${description}".${languageInstructions} Don't explain it, just give me the content.`;
  const mockingText = await generateText(prompt, model);

  console.log('');
  console.log(mockingText);

  return cleanUpPost(mockingText);
}

async function generateText(prompt, model = 'gpt-4.1-mini') {
  // Wrapper kept minimal so callers can fully control prompt shape.
  const response = await getOpenAI().responses.create({
    model,
    input: prompt,
  });

  if (response.output_text) {
    return response.output_text;
  }

  return '';
}

const psyopCommentTypes = ['supportive', 'strawman_opposition'];

async function createPsyopCommentText(postText, objective, type = undefined) {
  const model = 'gpt-4.1-mini';
  if (type === undefined) {
    type = getRandomElement(psyopCommentTypes);
  }

  const languageInstructions = languageInstructionFromText(postText, objective);

  // Type controls the rhetorical role of the generated comment.
  let prompt;
  if (type === 'strawman_opposition') {
    prompt =
      `Write a short social media comment that disagrees with or criticises this post: "${postText}". ` +
      `However, the comment must be poorly written and unconvincing: use clumsy phrasing, weak logic, ` +
      `emotional outbursts, spelling mistakes, incoherent reasoning, or conspiracy-like rhetoric. ` +
      `It should make the person opposing the post look foolish or unreasonable. ` +
      `Include some emoji.${languageInstructions} Output only the comment text with no explanation.`;
  } else {
    // supportive
    prompt =
      `Write a short social media comment that enthusiastically agrees with this post: "${postText}". ` +
      `The comment should reinforce the post's message and feel natural, as if written by a real person. ` +
      `Include some emoji.${languageInstructions} Output only the comment text with no explanation.`;
  }

  const commentText = await generateText(prompt, model);
  return { text: cleanUpPost(commentText), type };
}

async function createPsyopDemolisherReply(postText, strawmanComment, _objective, commentUserId) {
  const model = 'gpt-4.1-mini';

  const languageInstructions = languageInstructionFromText(postText, strawmanComment);

  const prompt =
    `You are replying to this poorly reasoned comment: "${strawmanComment}" ` +
    `which was posted on this social media post: "${postText}". ` +
    `Write a short, articulate, and confident social media reply that dismantles the comment point by point. ` +
    `Use a calm, measured, and seemingly evidence-based tone. Cite plausible-sounding facts or statistics ` +
    `(they do not need to be real). The reply should make the original commenter look uninformed ` +
    `and should reinforce the narrative of the original post. ` +
    `Include some emoji.${languageInstructions} Output only the reply text with no explanation.`;

  const replyText = await generateText(prompt, model);
  // Encode the AI-generated reply before it's wrapped in literal HTML below — the
  // combined string is stored and rendered raw, so only the intentional <span>
  // markup itself should remain unescaped.
  const cleanReply = encode(cleanUpPost(replyText));
  // Return tagged mention when caller provides the target comment author id.
  if (commentUserId) {
    return `<span style="color: red; font-weight: bold;">@${encode(commentUserId)}</span> ${cleanReply}`;
  }
  return cleanReply;
}

async function createPsyopPostText(objective, target, strategy) {
  const model = 'gpt-4.1-mini';

  // Strategy guide maps UI-selected strategy to generation constraints.
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
  const languageInstructions = languageInstructionFromText(objective, target);

  const prompt =
    `You are crafting a social media post as part of a psychological operation (PsyOp).\n\n` +
    `Objective: ${objective}\n` +
    `Target audience: ${target}\n` +
    `Strategy: ${strategy} — ${guide}\n\n` +
    `Write a single realistic social media post that achieves the objective above, ` +
    `is specifically crafted for the described audience, and follows the ${strategy} strategy. ` +
    `Include relevant emojis. Make it feel completely natural, as if written by a real person.${languageInstructions} ` +
    `Output only the post text with no explanation or commentary.`;

  const postTextRaw = await generateText(prompt, model);
  console.log(`\nPsyOp Post (${strategy}): ${postTextRaw}`);
  return cleanUpPost(postTextRaw);
}

export {
  createPostText,
  editText,
  createCommentText,
  createCommentReply,
  cleanUpPost,
  mockImage,
  generateText,
  createPsyopPostText,
  createPsyopCommentText,
  createPsyopDemolisherReply,
  looksLikePortuguese,
};
