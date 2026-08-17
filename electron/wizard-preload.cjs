// Preload for the Settings/wizard windows. Separate from electron/preload.cjs
// (used by the main app window) because this window needs a materially
// different, larger surface: reading/writing config, validating an OpenAI key,
// relaunching the app. Keeping the two preloads distinct means the main
// window -- the one actually shown to a classroom, possibly projected -- keeps
// the smallest possible bridge to Node/Electron.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nexySetup', {
  getConfig: () => ipcRenderer.invoke('nexy:get-config'),
  saveConfig: (patch) => ipcRenderer.invoke('nexy:save-config', patch),
  validateApiKey: (apiKey) => ipcRenderer.invoke('nexy:validate-api-key', apiKey),
  getJoinInfo: () => ipcRenderer.invoke('nexy:get-join-info'),
  openExternal: (url) => ipcRenderer.send('nexy:open-external', url),
  relaunch: () => ipcRenderer.send('nexy:relaunch'),
  close: () => ipcRenderer.send('nexy:close-settings'),
});
