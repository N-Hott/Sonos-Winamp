const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('sonosAmp', {
  bounds: bounds => ipcRenderer.send('player-bounds', bounds),
  action: action => ipcRenderer.send('player-action', action),
  onStatus: callback => ipcRenderer.on('player-status', (_event, message) => callback(message)),
  onRestore: callback => ipcRenderer.on('player-restore', () => callback()),
  getRooms: () => ipcRenderer.invoke('mini-get-rooms'),
  selectRoom: label => ipcRenderer.send('mini-select-room', label),
  presetChanged: name => ipcRenderer.send('preset-changed', name),
  onInitPreset: callback => ipcRenderer.on('init-preset', (_event, name) => callback(name))
});
