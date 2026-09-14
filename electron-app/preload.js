const { contextBridge, ipcRenderer } = require('electron');

// Exposes a minimal, safe bridge to the renderer: it can only ask the main
// process to generate a kill-switch file and show a save dialog. It cannot
// read/write arbitrary files or access Node APIs directly.
contextBridge.exposeInMainWorld('electronAPI', {
  generateFile: (payload) => ipcRenderer.invoke('generate-file', payload),
});
