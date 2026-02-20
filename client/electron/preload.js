const { contextBridge } = require('electron');

// Expose Nexus config to the renderer process safely
contextBridge.exposeInMainWorld('__NEXUS_CONFIG__', {
  serverUrl: process.env.NEXUS_SERVER_URL || process.env.REACT_APP_SERVER_URL || '',
  isDesktop: true,
  platform: process.platform,
});
