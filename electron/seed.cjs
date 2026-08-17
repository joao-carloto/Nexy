// First-run (and update) seeding: copies the demo world bundled with the app
// into the teacher's writable userData/data directory, and never touches it
// again once a live DB exists there -- the whole point of the seed is to give a
// teacher a working classroom on day one; overwriting it on every launch would
// destroy whatever their class has since created.
//
// Ships as plain files under resources/seed/<locale>/ (extraResources in the
// electron-builder config, NOT inside the asar), built by scripts/build-seed.mjs.
const fs = require('fs');
const path = require('path');

function seedRootFor(locale) {
  // In development, resources/seed/<locale> lives in the repo. In a packaged
  // app, extraResources places it at process.resourcesPath/seed/<locale>.
  const packaged = path.join(process.resourcesPath || '', 'seed', locale);
  if (fs.existsSync(packaged)) return packaged;
  return path.join(__dirname, '..', 'resources', 'seed', locale);
}

function readManifest(seedRoot) {
  const manifestPath = path.join(seedRoot, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return null;
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

async function copyDirRecursive(src, dest) {
  await fs.promises.mkdir(dest, { recursive: true });
  const entries = await fs.promises.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDirRecursive(srcPath, destPath);
    } else {
      // Skip files that already exist, so an interrupted/resumed copy doesn't
      // redo work -- images are content-addressed by filename and never change
      // once written, so "already there" always means "already correct".
      if (!fs.existsSync(destPath)) {
        await fs.promises.copyFile(srcPath, destPath);
      }
    }
  }
}

// Performs the first-run copy: seed DB -> a .partial file, seed images -> the
// data dir, then rename .partial into place. The rename is the crux: if the
// teacher closes the app (or the laptop sleeps) mid-copy, there is no
// `nexyDB.sqlite` yet, so the NEXT launch sees "no DB" and restarts the whole
// seed cleanly, instead of booting against a half-populated database.
async function performFreshSeed(seedRoot, dataDir) {
  const dbDest = path.join(dataDir, 'nexyDB.sqlite');
  const dbPartial = `${dbDest}.partial`;
  const uploadsDest = path.join(dataDir, 'uploads');

  await fs.promises.mkdir(dataDir, { recursive: true });
  await copyDirRecursive(path.join(seedRoot, 'uploads'), uploadsDest);
  await fs.promises.copyFile(path.join(seedRoot, 'nexyDB.sqlite'), dbPartial);
  await fs.promises.rename(dbPartial, dbDest);
}

// Decides what to do on launch:
//  - no DB yet in userData -> fresh seed (first run, or a previous run that was
//    interrupted before the .partial rename committed)
//  - DB exists, seed is newer -> additive top-up is intentionally NOT
//    implemented yet (see plan doc §7): it requires care around comments'
//    AUTOINCREMENT ids colliding with teacher-created ones. For now a newer
//    seedVersion is a no-op; nothing is silently overwritten.
//  - DB exists, seed is same/older -> nothing to do
async function runSeedIfNeeded({ userDataDir, config, updateConfig, locale }) {
  const seedLocale = locale || config.locale || 'en';
  const seedRoot = seedRootFor(seedLocale);
  const manifest = readManifest(seedRoot);
  if (!manifest) {
    console.warn(`No seed bundle found for locale "${seedLocale}" at ${seedRoot}; skipping seed step.`);
    return;
  }

  const dataDir = path.join(userDataDir, 'data');
  const dbPath = path.join(dataDir, 'nexyDB.sqlite');

  if (!fs.existsSync(dbPath)) {
    console.log(`No existing database at ${dbPath}; copying seed (v${manifest.seedVersion}, ${seedLocale})...`);
    await performFreshSeed(seedRoot, dataDir);
    updateConfig(userDataDir, { seedVersion: manifest.seedVersion, locale: seedLocale });
    console.log('Seed copy complete.');
    return;
  }

  if (manifest.seedVersion > (config.seedVersion || 0)) {
    console.log(
      `A newer seed bundle exists (v${manifest.seedVersion} > v${config.seedVersion || 0}), ` +
        'but additive top-up is not yet implemented -- leaving the existing database untouched.'
    );
  }
}

module.exports = { runSeedIfNeeded, seedRootFor, readManifest };
