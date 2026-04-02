const { app, BrowserWindow, nativeTheme, ipcMain, Notification } = require('electron');
const path = require('path');
const fs = require('fs/promises');

const dataPath = () => path.join(app.getPath('userData'), 'uz-planner-data.json');

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1100,
    minHeight: 740,
    backgroundColor: '#0f1117',
    title: 'Uz Planner',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile('index.html');
};

ipcMain.handle('storage:read', async () => {
  try {
    const raw = await fs.readFile(dataPath(), 'utf8');
    return raw;
  } catch (err) {
    return null;
  }
});

ipcMain.handle('storage:write', async (_event, payload) => {
  try {
    await fs.writeFile(dataPath(), payload, 'utf8');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('notify', async (_event, { title, body }) => {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
    return { ok: true };
  }
  return { ok: false, error: 'Notification not supported' };
});

app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark';
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
