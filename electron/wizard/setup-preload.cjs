// Preload for the first-run wizard window. Separate from wizard-preload.cjs
// (used by Settings) because the wizard needs one extra capability Settings
// never does: telling main.cjs "setup is done, go ahead and boot the server" --
// exposing that broadly (e.g. to Settings, which runs AFTER the server is
// already up) would be a meaningless/dangerous capability to have lying around.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nexySetup', {
  getConfig: () => ipcRenderer.invoke('nexy:get-config'),
  saveConfig: (patch) => ipcRenderer.invoke('nexy:save-config', patch),
  validateApiKey: (apiKey) => ipcRenderer.invoke('nexy:validate-api-key', apiKey),
  getAvailableLocales: () => ipcRenderer.invoke('nexy:get-available-locales'),
  openExternal: (url) => ipcRenderer.send('nexy:open-external', url),
  completeSetup: (patch) => ipcRenderer.invoke('nexy:complete-setup', patch),
});
