// Fails fast if any post or user in the seed database references an image
// file that doesn't exist on disk. Run automatically before build-seed.mjs
// packages the DB into the shipped installer -- catches drift like a manually
// deleted image file whose DB row never got cleaned up (see the 2026-08
// TechieTom/camel-burger incident: 4 posts shipped with broken images because
// files were deleted by hand without deleting the matching posts rows).
//
// Every post is assumed by the server (app.mjs GET /posts, GET /posts/:id) to
// have an image at post_images/<id>.png and a thumbnail at
// thumbnails/post_images/<id>-thumbnail.png -- there is no "post with no
// image" case, so both are required for every row. A user's profile picture
// is optional (profilePictureName can be NULL), but when a user posts or
// comments, the client resolves their avatar thumbnail by userId (see
// manage_bots.js, random_bot.js), so any user with a non-null
// profilePictureName must also have a matching thumbnail.
//
// Run with: npm run check:seed (also runs automatically before build:seed)
import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');

const SOURCE_DB = path.join(REPO_ROOT, 'server', 'data', 'nexyDB.sqlite');
const SOURCE_UPLOADS = path.join(REPO_ROOT, 'server', 'data', 'uploads');
const POST_IMAGES_DIR = path.join(SOURCE_UPLOADS, 'post_images');
const POST_THUMBNAILS_DIR = path.join(SOURCE_UPLOADS, 'thumbnails', 'post_images');
const PROFILE_PICTURES_DIR = path.join(SOURCE_UPLOADS, 'profile_pictures');
const PROFILE_THUMBNAILS_DIR = path.join(SOURCE_UPLOADS, 'thumbnails', 'profile_pictures');

function queryAll(db, sql) {
  return new Promise((resolve, reject) => {
    db.all(sql, [], (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

async function main() {
  const db = new sqlite3.Database(SOURCE_DB, sqlite3.OPEN_READONLY);
  const problems = [];

  const posts = await queryAll(db, 'SELECT id FROM posts');
  for (const { id } of posts) {
    const image = path.join(POST_IMAGES_DIR, `${id}.png`);
    const thumbnail = path.join(POST_THUMBNAILS_DIR, `${id}-thumbnail.png`);
    if (!fs.existsSync(image)) problems.push(`post ${id}: missing image ${path.relative(REPO_ROOT, image)}`);
    if (!fs.existsSync(thumbnail))
      problems.push(`post ${id}: missing thumbnail ${path.relative(REPO_ROOT, thumbnail)}`);
  }

  const users = await queryAll(db, 'SELECT userId, profilePictureName FROM users WHERE profilePictureName IS NOT NULL');
  for (const { userId, profilePictureName } of users) {
    const picture = path.join(PROFILE_PICTURES_DIR, profilePictureName);
    const thumbnail = path.join(PROFILE_THUMBNAILS_DIR, `${userId}-thumbnail.png`);
    if (!fs.existsSync(picture)) problems.push(`user ${userId}: missing profile picture ${path.relative(REPO_ROOT, picture)}`);
    if (!fs.existsSync(thumbnail))
      problems.push(`user ${userId}: missing profile thumbnail ${path.relative(REPO_ROOT, thumbnail)}`);
  }

  db.close();

  if (problems.length) {
    console.error(`Seed integrity check failed: ${problems.length} problem(s) found.\n`);
    for (const p of problems) console.error(`  - ${p}`);
    console.error(
      '\nEach of these DB rows references a file that does not exist. Either restore the file or delete the row (and, for posts, its comments) before building the seed.'
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Seed integrity check passed: ${posts.length} post(s), ${users.length} user picture(s) all have matching files.`);
}

main().catch((err) => {
  console.error('check-seed-integrity failed:', err);
  process.exitCode = 1;
});
