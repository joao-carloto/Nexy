import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// __dirname-based resolution only: never path.resolve() / process.cwd(), which
// break as soon as the app is launched from outside the repo root (e.g. packaged
// under Electron, where CWD is unrelated to the install directory).
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read-only app bundle root. In a packaged Electron app this lives inside the
// (read-only) asar/install directory.
export const APP_ROOT = path.join(__dirname, '..');
export const PUBLIC_DIR = path.join(APP_ROOT, 'public');
export const PUBLIC_HTML_DIR = path.join(PUBLIC_DIR, 'html');

// Writable data root. Electron's main process sets NEXY_USER_DATA (to
// app.getPath('userData')) before importing this server, so all user-generated
// content lands outside the read-only install directory. Falls back to the
// existing in-repo location so `npm start` behaves exactly as before.
export const DATA_ROOT = process.env.NEXY_USER_DATA
  ? path.join(process.env.NEXY_USER_DATA, 'data')
  : path.join(APP_ROOT, 'server', 'data');

export const DB_PATH = path.join(DATA_ROOT, 'nexyDB.sqlite');

export const UPLOADS_ROOT = path.join(DATA_ROOT, 'uploads');
export const POST_IMAGES_DIR = path.join(UPLOADS_ROOT, 'post_images');
export const PROFILE_PICTURES_DIR = path.join(UPLOADS_ROOT, 'profile_pictures');
export const POST_THUMBNAILS_DIR = path.join(UPLOADS_ROOT, 'thumbnails/post_images');
export const PROFILE_THUMBNAILS_DIR = path.join(UPLOADS_ROOT, 'thumbnails/profile_pictures');
// Quarantine dir for raw uploads: NOT mounted as static, so an uploaded file is never
// web-accessible until it has been validated and processed into POST_IMAGES_DIR.
export const TEMP_UPLOADS_DIR = path.join(UPLOADS_ROOT, 'tmp_uploads');

// Creates every writable data directory this app needs, idempotently.
export function ensureDataDirs() {
  fs.mkdirSync(DATA_ROOT, { recursive: true });
  for (const dir of [
    POST_IMAGES_DIR,
    PROFILE_PICTURES_DIR,
    POST_THUMBNAILS_DIR,
    PROFILE_THUMBNAILS_DIR,
    TEMP_UPLOADS_DIR,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Run as a side effect of loading this module, not left for app.mjs to call
// explicitly. Three separate modules (app.mjs, utils.js, post_creator.js) each
// open a sqlite3.Database(DB_PATH) at their own top level, and ES module
// imports are hoisted: app.mjs imports post_creator.js/utils.js (which import
// this module transitively) BEFORE app.mjs's own top-level code runs, so an
// explicit ensureDataDirs() call placed in app.mjs would run too late on a
// fresh install with no pre-existing DATA_ROOT (all three DB opens race the
// directory creation and lose with SQLITE_CANTOPEN). Running it here means it
// always happens at the first import of paths.mjs, before any of those DB
// handles are constructed, regardless of import order.
ensureDataDirs();
