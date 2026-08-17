// Builds the "seed" bundle shipped inside the packaged app: a recompressed copy
// of the demo database + images that a first launch copies into the teacher's
// writable userData directory (see server/paths.mjs and the Electron main
// process seeding step).
//
// Why this exists: the real server/data/uploads/ is ~223MB of full-resolution
// AI-generated PNGs. Recompressing to JPEG bytes -- while keeping every existing
// filename and extension exactly as-is -- gets that down to roughly 15MB with
// zero code, DB, or client changes, because:
//   - sharp and image-js (the two libraries this app reads images with) sniff
//     magic bytes, not extensions;
//   - browsers do the same, and ignore a mismatched Content-Type;
//   - the DB and ~12 client sites reference images purely by filename, never by
//     format, so nothing needs to change to keep working.
//
// Run with: npm run build:seed
import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');

const SOURCE_DB = path.join(REPO_ROOT, 'server', 'data', 'nexyDB.sqlite');
const SOURCE_UPLOADS = path.join(REPO_ROOT, 'server', 'data', 'uploads');

const SEED_LOCALE = process.env.SEED_LOCALE || 'en';
const OUTPUT_ROOT = path.join(REPO_ROOT, 'resources', 'seed', SEED_LOCALE);
const OUTPUT_DB = path.join(OUTPUT_ROOT, 'nexyDB.sqlite');
const OUTPUT_UPLOADS = path.join(OUTPUT_ROOT, 'uploads');

const SEED_VERSION = 1;

// Files to leave out of the seed even though they're still present in
// server/data/uploads. Empty as of the corpus cleanup that removed every
// orphaned (no matching posts/users row) file -- 9 files, including some that
// turned out to be real, non-AI-generated photos rather than fictional content
// (see plan doc). Each entry here should be individually verified against the
// DB before being added; nothing should be excluded on assumption alone.
const EXCLUDED_FILES = new Set();

const JPEG_OPTIONS = { quality: 82, mozjpeg: true };

async function listFilesRecursive(dir, baseDir = dir) {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(fullPath, baseDir)));
    } else if (entry.isFile()) {
      files.push(path.relative(baseDir, fullPath).split(path.sep).join('/'));
    }
  }
  return files;
}

async function recompressImages() {
  const relativeFiles = await listFilesRecursive(SOURCE_UPLOADS);
  const included = relativeFiles.filter((f) => !EXCLUDED_FILES.has(f));
  const skipped = relativeFiles.filter((f) => EXCLUDED_FILES.has(f));

  if (skipped.length) {
    console.log(`Skipping ${skipped.length} excluded file(s):`);
    for (const f of skipped) console.log(`  - ${f}`);
  }

  let totalBefore = 0;
  let totalAfter = 0;
  let processed = 0;

  for (const relativePath of included) {
    // tmp_uploads is a runtime-only quarantine dir; never part of the seed.
    if (relativePath.startsWith('tmp_uploads/')) continue;

    const sourcePath = path.join(SOURCE_UPLOADS, relativePath);
    const destPath = path.join(OUTPUT_UPLOADS, relativePath);
    await fs.promises.mkdir(path.dirname(destPath), { recursive: true });

    const beforeStat = await fs.promises.stat(sourcePath);
    totalBefore += beforeStat.size;

    // Preserve the filename (and its extension) exactly as it exists today --
    // do NOT rename to .jpg. Uploads can legitimately be .jpg/.jpeg/.webp
    // already (see ALLOWED_UPLOAD_MIME_TYPES in server/app.mjs), and post/profile
    // images are matched by filename convention across ~12 client call sites, so
    // renaming would break those references.
    let pipeline = sharp(sourcePath).jpeg(JPEG_OPTIONS);
    // Thumbnails carry an alpha channel (see .ensureAlpha() in image_creator.js);
    // JPEG has no alpha, so sharp flattens transparent pixels to white. These are
    // opaque AI-generated photos, so this is a no-op in practice -- flag it here
    // so it's easy to find if a future non-photo asset needs different handling.
    pipeline = pipeline.flatten({ background: '#ffffff' });

    const buffer = await pipeline.toBuffer();
    await fs.promises.writeFile(destPath, buffer);
    totalAfter += buffer.length;
    processed += 1;
  }

  console.log(`Recompressed ${processed} image(s).`);
  console.log(`  Before: ${(totalBefore / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  After:  ${(totalAfter / 1024 / 1024).toFixed(1)} MB`);
  return { processed, totalBefore, totalAfter };
}

function vacuumDatabase() {
  return new Promise((resolve, reject) => {
    fs.copyFileSync(SOURCE_DB, OUTPUT_DB);
    const db = new sqlite3.Database(OUTPUT_DB, (err) => {
      if (err) return reject(err);
      db.run('VACUUM', (vErr) => {
        db.close((closeErr) => {
          if (vErr) return reject(vErr);
          if (closeErr) return reject(closeErr);
          resolve();
        });
      });
    });
  });
}

async function writeManifest(stats) {
  const manifest = {
    seedVersion: SEED_VERSION,
    locale: SEED_LOCALE,
    builtAt: new Date().toISOString(),
    files: stats.processed,
    sizeBytes: stats.totalAfter,
  };
  await fs.promises.writeFile(path.join(OUTPUT_ROOT, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

async function main() {
  console.log(`Building seed bundle for locale "${SEED_LOCALE}"...`);
  await fs.promises.rm(OUTPUT_ROOT, { recursive: true, force: true });
  await fs.promises.mkdir(OUTPUT_UPLOADS, { recursive: true });

  const stats = await recompressImages();

  const dbBefore = (await fs.promises.stat(SOURCE_DB)).size;
  await vacuumDatabase();
  const dbAfter = (await fs.promises.stat(OUTPUT_DB)).size;
  console.log(`Database: ${(dbBefore / 1024).toFixed(0)} KB -> ${(dbAfter / 1024).toFixed(0)} KB (VACUUMed)`);

  await writeManifest(stats);

  console.log(`Seed bundle written to ${path.relative(REPO_ROOT, OUTPUT_ROOT)}`);
}

main().catch((err) => {
  console.error('build-seed failed:', err);
  process.exitCode = 1;
});
