// Minimal preload script. The main window runs with contextIsolation + sandbox
// + nodeIntegration:false, so this is the ONLY bridge between the renderer (the
// same web app served to a normal browser) and Electron/Node. Keep it tiny and
// specific -- exposing anything broader (ipcRenderer directly, fs, etc.) would
// undermine the sandboxing for no benefit, since the app itself has no need for
// filesystem or IPC access from within the page.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nexy', {
  // Opens the Settings window from the main process. Used by the "Set this up"
  // button the client shows when GET /ai/status reports canConfigure: true (see
  // public/js/ai_availability.js) -- there is no in-page route for Settings,
  // since it's a separate BrowserWindow, not a page served by the Express app.
  openSettings: () => ipcRenderer.send('nexy:open-settings'),
});
