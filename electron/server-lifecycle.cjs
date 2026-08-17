// Helpers for starting/waiting on the in-process Express server from Electron's
// main process. Kept separate from main.js so the port-selection/readiness logic
// is independently testable and readable.
const net = require('net');

// Finds a free TCP port by asking the OS for one (listen on port 0), then
// releasing it immediately. There's a theoretical race between the release and
// the real server binding it, but on loopback that window is microseconds.
function findFreePort(host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on('error', reject);
    probe.listen(0, host, () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

// Polls a cheap, side-effect-free endpoint until the server responds, instead of
// guessing a fixed delay. /admin/status is ideal: no DB access, always 200.
async function waitForServerReady(baseUrl, { timeoutMs = 15000, intervalMs = 100 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/admin/status`);
      if (res.ok) return true;
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(
    `Server did not become ready within ${timeoutMs}ms` + (lastError ? `: ${lastError.message}` : '')
  );
}

// Starts the Express server exactly once (this is called once per Electron
// process lifetime -- app.requestSingleInstanceLock() in main.js guarantees
// there is never a second launch to race against). app.mjs is imported exactly
// once here, deliberately: the app opens THREE independent sqlite3 connections
// to the same file across app.mjs/utils.js/post_creator.js, and only app.mjs's
// is exported. A retry-by-reimporting-the-module-graph design would leak the
// other two connections per attempt (verified while testing this module -- an
// early version did exactly that and produced SQLITE_BUSY on a second import).
// Instead, the free-port race (microseconds wide, findFreePort() releases the
// port immediately before app.mjs's own app.listen() re-acquires it) is
// resolved by re-picking a fresh port and asking the OS again a few times
// BEFORE ever importing the server module, so app.mjs's own top-level code
// (and its DB connections) only ever runs once.
async function startServer({ userDataDir, host, env, maxPortAttempts = 5 }) {
  process.env.NEXY_USER_DATA = userDataDir;
  process.env.HOST = host;
  for (const [key, value] of Object.entries(env)) {
    if (value === null || value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = String(value);
    }
  }

  let port;
  for (let attempt = 1; attempt <= maxPortAttempts; attempt += 1) {
    const candidate = await findFreePort(host);
    // Re-probe: if something else grabs this exact port in between, a second
    // findFreePort() call will simply hand back a different one.
    const stillFree = await new Promise((resolve) => {
      const probe = net.createServer();
      probe.once('error', () => resolve(false));
      probe.listen(candidate, host, () => probe.close(() => resolve(true)));
    });
    if (stillFree) {
      port = candidate;
      break;
    }
  }
  if (!port) {
    throw new Error(`Could not find a free port on ${host} after ${maxPortAttempts} attempts`);
  }
  process.env.PORT = String(port);

  const mod = await import('../server/app.mjs');
  await new Promise((resolve, reject) => {
    mod.server.once('listening', resolve);
    mod.server.once('error', reject);
  });

  const baseUrl = `http://${host}:${port}`;
  await waitForServerReady(baseUrl);
  return { server: mod.server, db: mod.db, port, baseUrl };
}

module.exports = { findFreePort, waitForServerReady, startServer };
