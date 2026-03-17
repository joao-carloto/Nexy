import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';

// Define paths
const profilePicturesDir = path.join('data', 'profile-pictures');
const thumbnailPicturesDir = path.join('data', 'thumbnails', 'profile-pictures');
const dbPath = path.join('server/data', 'nexyDB.sqlite');

// Open the database
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }
  console.log('Database connected successfully.');
});

// Function to rename files and update the database
async function updateProfilePictures() {
  try {
    // Query to get userId and guid mapping from the database
    const query = 'SELECT userId, profilePictureName FROM users';

    db.all(query, async (err, rows) => {
      if (err) {
        console.error('Error fetching user data:', err.message);
        return;
      }

      for (const row of rows) {
        const { userId, profilePictureName } = row;

        // Extract the GUID from the current profile picture filename
        const guid = profilePictureName.replace('.png', '');

        // Define old and new file paths
        const oldProfilePicturePath = path.join(profilePicturesDir, `${guid}.png`);
        const oldThumbnailPath = path.join(thumbnailPicturesDir, `${guid}-thumbnail.png`);
        const newProfilePicturePath = path.join(profilePicturesDir, `${userId}.png`);
        const newThumbnailPath = path.join(thumbnailPicturesDir, `${userId}-thumbnail.png`);

        // Rename the profile picture
        if (fs.existsSync(oldProfilePicturePath)) {
          fs.renameSync(oldProfilePicturePath, newProfilePicturePath);
          console.log(`Renamed: ${oldProfilePicturePath} -> ${newProfilePicturePath}`);
        } else {
          console.warn(`Profile picture not found: ${oldProfilePicturePath}`);
        }

        // Rename the thumbnail
        if (fs.existsSync(oldThumbnailPath)) {
          fs.renameSync(oldThumbnailPath, newThumbnailPath);
          console.log(`Renamed: ${oldThumbnailPath} -> ${newThumbnailPath}`);
        } else {
          console.warn(`Thumbnail not found: ${oldThumbnailPath}`);
        }

        // Update the database with the new profile picture name
        const updateQuery = 'UPDATE users SET profilePictureName = ? WHERE userId = ?';
        db.run(updateQuery, [`${userId}.png`, userId], (updateErr) => {
          if (updateErr) {
            console.error(`Error updating database for userId ${userId}:`, updateErr.message);
          } else {
            console.log(`Database updated for userId ${userId}`);
          }
        });
      }
    });
  } catch (error) {
    console.error('Error during update:', error.message);
  } finally {
    // Close the database connection
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err.message);
      } else {
        console.log('Database connection closed.');
      }
    });
  }
}

// Run the update function
updateProfilePictures();
