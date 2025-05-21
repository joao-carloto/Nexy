import sqlite3 from "sqlite3";

const db = new sqlite3.Database("./data/nexyDB.sqlite");

function getRandomElement(arr) {
  // Generate a random index based on the array length
  const randomIndex = Math.floor(Math.random() * arr.length);
  // Return the element at the random index
  return arr[randomIndex];
}

function getRandomBoolean() {
  return Math.random() >= 0.5;
}

async function getRandomUserIdFromDB() {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT userId
      FROM users
      ORDER BY RANDOM()
      LIMIT 1
    `;

    db.get(query, (err, row) => {
      if (err) {
        console.error(
          "Error fetching random userId from database:",
          err.message
        );
        reject(new Error("Failed to fetch random userId from the database."));
      } else if (!row) {
        reject(new Error("No users found in the database."));
      } else {
        resolve(row.userId);
      }
    });
  });
}

// Get post text according to postId
async function getPostTextFromDB(postId) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT postText
      FROM posts
      WHERE id = ?
    `;

    db.get(query, [postId], (err, row) => {
      if (err) {
        console.error("Error fetching post text from database:", err.message);
        reject(new Error("Failed to fetch post text from the database."));
      } else if (!row) {
        reject(new Error("No post found with the given ID."));
      } else {
        resolve(row.postText);
      }
    });
  });
}
export {
  getRandomElement,
  getRandomBoolean,
  getRandomUserIdFromDB,
  getPostTextFromDB,
};
