// Electron main process. Runs the existing Express server in-process (both
// native deps, sqlite3 and sharp, are N-API and load fine under Electron with
// no rebuild -- see the plan doc), then shows it in a BrowserWindow pointed at
// http://127.0.0.1:<port>/. Never file://: every client fetch is root-relative
// and admin auth depends on an HttpOnly SameSite=Strict cookie, both of which
// require a real http(s) origin.
const path = require('path');
const { app, BrowserWindow, Menu, shell, session, ipcMain } = require('electron');

const { startServer } = require('./server-lifecycle.cjs');
const { loadConfig, updateConfig, generateAdminPassword, generateTokenSecret } = require('./config.cjs');
const { runSeedIfNeeded, seedRootFor, readManifest } = require('./seed.cjs');
const { validateApiKey } = require('./api-key-validation.cjs');
const { getLanAddress } = require('./lan-address.cjs');

const SUPPORTED_LOCALES = ['en', 'pt'];

// Locales that actually have a seed bundle available right now (checked at
// runtime, not assumed) -- e.g. only 'en' ships until the PT seed is built, so
// the wizard's language screen should only ever offer a language it can
// actually seed. See seed.cjs's seedRootFor/readManifest.
function getAvailableLocales() {
  return SUPPORTED_LOCALES.filter((locale) => readManifest(seedRootFor(locale)) !== null);
}

// Prevents two copies of Nexy (and two Express servers) fighting over the same
// data directory and port if a teacher double-clicks the shortcut twice.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  let mainWindow = null;
  let settingsWindow = null;
  let setupWindow = null;
  let runningServer = null;
  // Set by createSetupWindow() while it's showing; called by the
  // nexy:complete-setup handler to unblock the awaiting launch sequence.
  let onSetupComplete = null;

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // First-run wizard, shown BEFORE the server starts (unlike Settings, which
  // opens from the running app's menu). Resolves once the teacher finishes or
  // skips key setup -- main.cjs's launch sequence awaits this before proceeding
  // to seed/start the server, since the wizard's choices (locale, key) affect
  // both.
  function createSetupWindow() {
    return new Promise((resolve) => {
      setupWindow = new BrowserWindow({
        width: 720,
        height: 620,
        autoHideMenuBar: true,
        resizable: false,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          preload: path.join(__dirname, 'wizard', 'setup-preload.cjs'),
          devTools: !app.isPackaged,
        },
      });
      setupWindow.setMenuBarVisibility(false);
      setupWindow.loadFile(path.join(__dirname, 'wizard', 'setup.html'));

      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      // Set so the nexy:complete-setup handle() below can signal completion
      // without relying on ipcMain's own EventEmitter internals -- a plain
      // module-scope callback reference is simpler and more explicit than
      // re-emitting a channel name that .handle() already consumed.
      onSetupComplete = finish;

      // The teacher might also just close the window (red X) before
      // finishing. Either way the launch sequence must not hang forever: fall
      // back to whatever got saved (possibly nothing beyond the generated
      // admin password/token secret set before this window was shown).
      setupWindow.on('closed', () => {
        setupWindow = null;
        onSetupComplete = null;
        finish();
      });
    });
  }

  // Settings talks to the app exclusively through the nexySetup IPC bridge
  // (wizard-preload.cjs), never by fetching the Express server directly, so it
  // needs no knowledge of which port the server ended up on.
  function createSettingsWindow() {
    if (settingsWindow) {
      settingsWindow.focus();
      return;
    }
    settingsWindow = new BrowserWindow({
      width: 640,
      height: 720,
      parent: mainWindow || undefined,
      autoHideMenuBar: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        preload: path.join(__dirname, 'wizard-preload.cjs'),
        devTools: !app.isPackaged,
      },
    });
    settingsWindow.setMenuBarVisibility(false);
    settingsWindow.loadFile(path.join(__dirname, 'wizard', 'settings.html'));
    settingsWindow.on('closed', () => {
      settingsWindow = null;
    });
  }

  function buildMenu() {
    const template = [
      {
        label: 'File',
        submenu: [
          {
            label: 'Settings...',
            click: () => createSettingsWindow(),
          },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      {
        label: 'View',
        submenu: [
          { role: 'zoomIn', accelerator: 'CmdOrCtrl+=' },
          { role: 'zoomOut' },
          { role: 'resetZoom' },
          { type: 'separator' },
          { role: 'togglefullscreen' },
        ],
      },
      {
        label: 'Help',
        submenu: [
          {
            label: 'Nexy on GitHub',
            click: () => shell.openExternal('https://github.com/joao-carloto/nexy'),
          },
        ],
      },
    ];
    return Menu.buildFromTemplate(template);
  }

  async function createMainWindow(baseUrl) {
    const userDataDir = app.getPath('userData');
    const config = loadConfig(userDataDir);

    mainWindow = new BrowserWindow({
      width: (config.windowBounds && config.windowBounds.width) || 1280,
      height: (config.windowBounds && config.windowBounds.height) || 860,
      minWidth: 900,
      minHeight: 600,
      show: false,
      // Deliberately visible (not autoHideMenuBar) -- File > Settings... is the
      // ONLY way a teacher reaches the API key, admin password, and classroom
      // mode toggle. Hiding the menu bar behind "press Alt" (Electron's
      // default with autoHideMenuBar) makes those unreachable for anyone who
      // doesn't already know that shortcut exists, which defeats the point of
      // building this for non-technical teachers in the first place.
      icon: path.join(__dirname, 'icons', 'nexy.ico'),
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        preload: path.join(__dirname, 'preload.cjs'),
        devTools: !app.isPackaged,
      },
    });

    Menu.setApplicationMenu(buildMenu());

    if (config.zoomLevel) {
      mainWindow.webContents.setZoomLevel(config.zoomLevel);
    }

    // Never let the app open a second Electron window for external/target=_blank
    // links (e.g. the 9 reference links in help_popup_content.html) -- send them
    // to the teacher's real browser instead.
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    });

    // Defense in depth: block any in-window navigation away from our own
    // server origin (e.g. a stray absolute link), so the embedded window can
    // never turn into a general-purpose browser.
    mainWindow.webContents.on('will-navigate', (event, url) => {
      if (!url.startsWith(baseUrl)) {
        event.preventDefault();
        shell.openExternal(url);
      }
    });

    mainWindow.on('close', () => {
      const bounds = mainWindow.getBounds();
      const zoomLevel = mainWindow.webContents.getZoomLevel();
      updateConfig(userDataDir, { windowBounds: bounds, zoomLevel });
    });

    mainWindow.on('closed', () => {
      mainWindow = null;
    });

    mainWindow.once('ready-to-show', () => {
      mainWindow.show();
    });

    await mainWindow.loadURL(baseUrl);
  }

  app.whenReady().then(async () => {
    // No classroom needs a camera/mic/geolocation prompt popping up over a
    // lesson about not trusting things you're shown on a screen. clipboard-write
    // is the one exception: Settings' "Copy" buttons (API key, admin password,
    // classroom join URL) call navigator.clipboard.writeText(), which requires
    // this permission -- denying it made every Copy button silently fail
    // (the click handler doesn't await/catch the rejected promise, so the
    // button still showed "Copied!" while the clipboard kept its old,
    // unrelated content, e.g. the join URL after copying it once).
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) =>
      callback(permission === 'clipboard-write')
    );

    const userDataDir = app.getPath('userData');
    let config = loadConfig(userDataDir);

    if (!config.adminPassword) {
      config = updateConfig(userDataDir, { adminPassword: generateAdminPassword() });
    }
    if (!config.adminTokenSecret) {
      config = updateConfig(userDataDir, { adminTokenSecret: generateTokenSecret() });
    }

    // First launch (or a previous launch where the teacher closed the wizard
    // without finishing): show it and wait, since its choices (locale, key)
    // must be known before seeding/starting the server. Every later launch
    // skips straight past this, including one where the teacher chose "skip
    // key setup" -- that's still setupCompleted:true, just with no key.
    if (!config.setupCompleted) {
      await createSetupWindow();
      config = loadConfig(userDataDir);
    }

    await runSeedIfNeeded({ userDataDir, config, updateConfig });

    const host = config.classroomMode ? '0.0.0.0' : '127.0.0.1';
    const result = await startServer({
      userDataDir,
      host,
      env: {
        OPENAI_API_KEY: config.openaiApiKey,
        ADMIN_PASSWORD: config.adminPassword,
        ADMIN_TOKEN_SECRET: config.adminTokenSecret,
      },
    });
    runningServer = result;

    // Loopback for the window regardless of classroom mode's HOST=0.0.0.0 --
    // the embedded window always talks to the server via its own machine's
    // loopback interface, never over the LAN.
    await createMainWindow(`http://127.0.0.1:${result.port}`);
  });

  app.on('window-all-closed', () => {
    if (runningServer) {
      runningServer.server.close();
      runningServer.db.close();
    }
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  // --- IPC handlers used by the Settings/wizard window (see wizard-preload.cjs) ---

  ipcMain.handle('nexy:get-config', () => {
    const userDataDir = app.getPath('userData');
    const config = loadConfig(userDataDir);
    // Never send the raw key to the renderer for display -- Settings shows a
    // masked placeholder and only ever writes a new value, never reads the old
    // one back out. hasApiKey is enough for the UI to know whether a key is set.
    const { openaiApiKey, ...rest } = config;
    return { ...rest, hasApiKey: Boolean(openaiApiKey) };
  });

  ipcMain.handle('nexy:save-config', (_event, patch) => {
    const userDataDir = app.getPath('userData');
    const next = updateConfig(userDataDir, patch);

    // The OpenAI key is read per-call by server/openai_client.mjs's getOpenAI(),
    // so updating process.env here is enough to unlock AI features immediately
    // -- no server restart needed. ADMIN_PASSWORD/PORT are captured at server
    // import time (see server/app.mjs), so changes to those only take effect on
    // next launch; Settings must tell the teacher a restart is needed for those.
    if (Object.prototype.hasOwnProperty.call(patch, 'openaiApiKey')) {
      if (patch.openaiApiKey) {
        process.env.OPENAI_API_KEY = patch.openaiApiKey;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
    }

    const { openaiApiKey, ...rest } = next;
    return { ...rest, hasApiKey: Boolean(openaiApiKey) };
  });

  ipcMain.handle('nexy:validate-api-key', (_event, apiKey) => validateApiKey(apiKey));

  // Used by Settings to display/copy the address students should type in when
  // classroom mode is on. The toggle itself requires a restart to take effect
  // (HOST is read at server import time, like PORT/ADMIN_PASSWORD -- see
  // server/app.mjs), so this reports the CURRENT running server's port, which
  // is only meaningful once classroom mode is already active.
  ipcMain.handle('nexy:get-join-info', () => {
    if (!runningServer) return { address: null, port: null };
    return { address: getLanAddress(), port: runningServer.port };
  });

  ipcMain.on('nexy:open-external', (_event, url) => {
    shell.openExternal(url);
  });

  ipcMain.on('nexy:relaunch', () => {
    app.relaunch();
    app.quit();
  });

  ipcMain.on('nexy:close-settings', () => {
    if (settingsWindow) settingsWindow.close();
  });

  ipcMain.on('nexy:open-settings', () => {
    if (runningServer) {
      createSettingsWindow();
    }
  });

  // --- IPC handlers used only by the first-run wizard (see wizard/setup-preload.cjs) ---

  ipcMain.handle('nexy:get-available-locales', () => getAvailableLocales());

  // Persists the wizard's choices and unblocks createSetupWindow()'s promise
  // (via the 'nexy:complete-setup' listener registered there), letting
  // app.whenReady()'s launch sequence proceed to seeding/starting the server.
  ipcMain.handle('nexy:complete-setup', (_event, patch) => {
    const userDataDir = app.getPath('userData');
    const next = updateConfig(userDataDir, patch);
    if (Object.prototype.hasOwnProperty.call(patch, 'openaiApiKey') && patch.openaiApiKey) {
      process.env.OPENAI_API_KEY = patch.openaiApiKey;
    }
    // Unblocks app.whenReady()'s awaited createSetupWindow() so seeding/server
    // startup can proceed in the background WHILE the wizard is still showing
    // its "done" screen. Deliberately does NOT close setupWindow here -- the
    // teacher needs to actually read that screen (especially the "your key
    // works" one) and click "Open Nexy" themselves; closing it immediately on
    // save meant the window vanished the instant a key validated, before the
    // teacher ever saw confirmation or the button that's supposed to trigger it.
    if (onSetupComplete) onSetupComplete();
    const { openaiApiKey, ...rest } = next;
    return { ...rest, hasApiKey: Boolean(openaiApiKey) };
  });
}
