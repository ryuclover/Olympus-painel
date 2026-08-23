import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Você pode expor funções aqui caso queira comunicação segura (IPC)
  // entre o frontend React e o processo Node.js do Electron.
  getAppVersion: () => '1.0.0'
});
