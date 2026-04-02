const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('plannerStorage', {
  read: () => ipcRenderer.invoke('storage:read'),
  write: (payload) => ipcRenderer.invoke('storage:write', payload),
  notify: (title, body) => ipcRenderer.invoke('notify', { title, body })
});
