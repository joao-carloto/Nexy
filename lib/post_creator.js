import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from 'fs';
import dotenv from 'dotenv';

// Load environment variables from .env file
const result = dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

function getRandomElement(arr) {
    // Generate a random index based on the array length
    const randomIndex = Math.floor(Math.random() * arr.length);
    // Return the element at the random index
    return arr[randomIndex];
}

function getRandomBoolean() {
    return Math.random() >= 0.5;
}

  function getLastNonEmptyLine(str) {
    return str

    // Check if str is a string
    if (typeof str !== 'string') {
        throw new TypeError('Expected a string');
    }
    // Somel regex cleanup
    str = str.replace(/\*\*.*?\*\*/g, '');
    // Split the string into an array of lines
    const lines = str.split('\n');
    // Filter out empty lines
    const nonEmptyLines = lines.filter(line => line.trim() !== '');
    // Return the last non-empty line
    return nonEmptyLines[nonEmptyLines.length - 1];
}

function cleanUpPost(str) {
    // Somel regex cleanup
    str = str.replace(/\*\*.*?\*\*/g, '');
    str = str.replace(/\[.*?\]/g, "");
    // Split the string into an array of lines
    const lines = str.split('\n');
    // Filter out empty lines
    const nonEmptyLines = lines.filter(line => line.trim() !== '');
    // Filter out lines that contain the specified content
    const filteredLines = nonEmptyLines.filter(line => !line.includes("Okay, here's a"));
    // Join the filtered lines back into a single string
    return filteredLines.join('\n');
}


async function generateImage(contents) {
    // Set responseModalities to include "Image" so the model can generate  an image
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash-exp-image-generation",
      generationConfig: {
          responseModalities: ['Text', 'Image']
      },
    });
  
    try {
      const response = await model.generateContent(contents);
      for (const part of  response.response.candidates[0].content.parts) {
        // Based on the part type, either show the text or save the image
        if (part.text) {
          console.log(part.text);
        } else if (part.inlineData) {
          const imageData = part.inlineData.data;
          const buffer = Buffer.from(imageData, 'base64');
          fs.writeFileSync('gemini-native-image.png', buffer);
          console.log('Image saved as gemini-native-image.png');
        }
      }
    } catch (error) {
      console.error("Error generating content:", error);
    }
  }


async function createPost({topic = undefined, fake_news = undefined} ){
    const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash",
        // TODO: use this?
        // systemInstruction: "You are a cat. Your name is Neko."
      });
    
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
    ]

    // const lightTopics = ['social media post', 'some celebrity', 'internet influencer product placement']

    const lightTopics = ['some celebrity']

    if (topic === undefined) {
        let random_index = Math.floor(Math.random() * 2);
        let topic_list = random_index === 0 ? serious_topics : lightTopics;
        topic = getRandomElement(topic_list);
    }    

    let options = ''

    if (fake_news === undefined) fake_news = getRandomBoolean()
    if (fake_news) options = options + "It should be a fictious story about real people."
    
    let prompt_1 = `Tell me about some random trending topic on the news or social media about ${topic}.${options}.`;
    let result_1 = await model.generateContent(prompt_1);

    let prompt_2 = `Small social media post inspired on ${result_1.response.text()}. Just one option. Include some emoji. Don't explain it, just give me the content.`;
    let result_2 = await model.generateContent(prompt_2);
    console.log("\nCaption:");
    console.log(cleanUpPost(result_2.response.text()));

    let prompt_3 = `Small social media comment responding to ${result_2.response.text()} in an opposing tone. Just one option. Include some emoji.`;
    let result_3 = await model.generateContent(prompt_3);
    console.log("\nComment 1:");
    console.log(cleanUpPost(result_3.response.text()));

    let prompt_4 = `Small social media comment responding to ${result_2.response.text()} in an agreeing tone. Just one option. Include some emoji. Test should be from someone a bit iliterate, include some spelling errors`;
    let result_4 = await model.generateContent(prompt_3);
    console.log("\nComment 2:");
    console.log(cleanUpPost(result_4.response.text()));
    generateImage(`Create a realistic square photo inspired by: ${result_1.response.text()}`);
}

createPost({topic: "Economy", fake_news: true})