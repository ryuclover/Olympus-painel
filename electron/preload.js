const { contextBridge, ipcRenderer } = require('electron');

// Expõe uma API segura para o frontend React
contextBridge.exposeInMainWorld('electronAPI', {
  // Versão do app
  getVersion: () => ipcRenderer.invoke('get-version'),
});
