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

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toISOString().split(".")[0].replace("T", " ");
}

export {
  getRandomElement,
  getRandomBoolean,
  getRandomUserIdFromDB,
  formatDate,
};
