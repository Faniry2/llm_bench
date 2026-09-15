import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { registerIpcHandlers } from './ipc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

// electron-vite runs the app directly (no shell), so process.env never
// picks up a project-root .env the way a terminal-launched script would.
// Load it ourselves in dev; existing env vars still win.
function loadDotEnv(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
    if (key && !(key in process.env)) process.env[key] = value;
  }
}

if (isDev) loadDotEnv(path.join(__dirname, '../../.env'));

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0b0f19',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.CHINALLM_DEBUG_CONSOLE) {
    win.webContents.on('console-message', (event) => {
      console.log(`[renderer:${event.level}] ${event.message} (${event.sourceId}:${event.lineNumber})`);
    });
    win.webContents.on('preload-error', (_e, preloadPath, error) => {
      console.error(`[preload-error] ${preloadPath}`, error);
    });
    win.webContents.on('render-process-gone', (_e, details) => {
      console.error('[render-process-gone]', details);
    });
  }

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Block any content trying to open a new window outside our handler, and
// refuse navigations away from the app shell (defense in depth alongside
// contextIsolation/sandbox above).
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (navEvent, url) => {
    const isDevServer = isDev && process.env.ELECTRON_RENDERER_URL && url.startsWith(process.env.ELECTRON_RENDERER_URL);
    if (!isDevServer && !url.startsWith('file://')) {
      navEvent.preventDefault();
    }
  });
});
