import { ipcMain, BrowserWindow, dialog, shell, app } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { startRun, cancelRun, type StartRunRequest } from './runner.js';
import { getProvider, providerIds } from '../providers/registry.js';
import type { ProviderId } from '../providers/types.js';
import {
  setApiKey,
  getApiKey,
  hasApiKey,
  getRates,
  setRates,
  getSettings,
  setSetting,
  getHistory,
  pushHistory,
  clearHistory,
  deleteHistoryEntry,
  getLastPromptState,
  setLastPromptState
} from './secure-store.js';

export function registerIpcHandlers(): void {
  ipcMain.handle('run:start', (event, req: StartRunRequest) => {
    return startRun(event.sender, req);
  });

  ipcMain.handle('run:cancel', (_event, runId: string, providerId?: ProviderId) => {
    cancelRun(runId, providerId);
  });

  ipcMain.handle('keys:set', (_event, providerId: ProviderId, key: string) => {
    setApiKey(providerId, key);
  });

  ipcMain.handle('keys:has', () => {
    const out: Partial<Record<ProviderId, boolean>> = {};
    for (const id of providerIds) out[id] = hasApiKey(id);
    return out;
  });

  ipcMain.handle('keys:test', async (_event, providerId: ProviderId) => {
    const key = getApiKey(providerId);
    if (!key) return false;
    try {
      return await getProvider(providerId).testKey(key);
    } catch {
      return false;
    }
  });

  ipcMain.handle('rates:get', () => getRates());
  ipcMain.handle('rates:set', (_event, rates) => setRates(rates));

  ipcMain.handle('settings:get', () => getSettings());
  ipcMain.handle('settings:set', (_event, key: string, value: unknown) => {
    setSetting(key as never, value as never);
  });

  ipcMain.handle('history:get', () => getHistory());
  ipcMain.handle('history:push', (_event, entry: unknown) => pushHistory(entry));
  ipcMain.handle('history:clear', () => clearHistory());
  ipcMain.handle('history:delete', (_event, id: string) => deleteHistoryEntry(id));

  ipcMain.handle('promptState:get', () => getLastPromptState());
  ipcMain.handle('promptState:set', (_event, prompt: string, variables: Record<string, string>) =>
    setLastPromptState(prompt, variables)
  );

  ipcMain.handle('export:save', async (_event, opts: { defaultName: string; content: string; filters: { name: string; extensions: string[] }[] }) => {
    const win = BrowserWindow.getFocusedWindow();
    const dialogOptions = { defaultPath: opts.defaultName, filters: opts.filters };
    const { canceled, filePath } = win
      ? await dialog.showSaveDialog(win, dialogOptions)
      : await dialog.showSaveDialog(dialogOptions);
    if (canceled || !filePath) return { saved: false };
    await fs.writeFile(filePath, opts.content, 'utf-8');
    return { saved: true, filePath };
  });

  ipcMain.handle('export:openTemp', async (_event, opts: { fileName: string; content: string }) => {
    const dir = path.join(app.getPath('temp'), 'chinallm-bench');
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, opts.fileName);
    await fs.writeFile(filePath, opts.content, 'utf-8');
    await shell.openPath(filePath);
    return filePath;
  });

  ipcMain.handle('shell:openPath', async (_event, filePath: string) => {
    await shell.openPath(filePath);
  });

  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      await shell.openExternal(url);
    }
  });
}
