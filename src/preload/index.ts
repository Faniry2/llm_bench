import { contextBridge, ipcRenderer } from 'electron';
import type { ProviderId, RunResult, StreamDelta } from '../providers/types.js';
import type { StartRunRequest } from '../main/runner.js';
import type { RateCard } from '../pricing/rates.js';

export interface RunDeltaEvent {
  runId: string;
  providerId: ProviderId;
  delta: StreamDelta;
}
export interface RunResultEvent {
  runId: string;
  result: RunResult;
}
export interface RunDoneEvent {
  runId: string;
}

const api = {
  run: {
    start: (req: StartRunRequest): Promise<string> => ipcRenderer.invoke('run:start', req),
    cancel: (runId: string, providerId?: ProviderId): Promise<void> => ipcRenderer.invoke('run:cancel', runId, providerId),
    onDelta: (cb: (event: RunDeltaEvent) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, payload: RunDeltaEvent) => cb(payload);
      ipcRenderer.on('run:delta', listener);
      return () => ipcRenderer.removeListener('run:delta', listener);
    },
    onResult: (cb: (event: RunResultEvent) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, payload: RunResultEvent) => cb(payload);
      ipcRenderer.on('run:result', listener);
      return () => ipcRenderer.removeListener('run:result', listener);
    },
    onDone: (cb: (event: RunDoneEvent) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, payload: RunDoneEvent) => cb(payload);
      ipcRenderer.on('run:done', listener);
      return () => ipcRenderer.removeListener('run:done', listener);
    }
  },
  keys: {
    set: (providerId: ProviderId, key: string): Promise<void> => ipcRenderer.invoke('keys:set', providerId, key),
    has: (): Promise<Partial<Record<ProviderId, boolean>>> => ipcRenderer.invoke('keys:has'),
    test: (providerId: ProviderId): Promise<boolean> => ipcRenderer.invoke('keys:test', providerId)
  },
  rates: {
    get: (): Promise<Record<ProviderId, RateCard>> => ipcRenderer.invoke('rates:get'),
    set: (rates: Record<ProviderId, RateCard>): Promise<void> => ipcRenderer.invoke('rates:set', rates)
  },
  settings: {
    get: (): Promise<Record<string, unknown>> => ipcRenderer.invoke('settings:get'),
    set: (key: string, value: unknown): Promise<void> => ipcRenderer.invoke('settings:set', key, value)
  },
  history: {
    get: (): Promise<unknown[]> => ipcRenderer.invoke('history:get'),
    push: (entry: unknown): Promise<void> => ipcRenderer.invoke('history:push', entry),
    clear: (): Promise<void> => ipcRenderer.invoke('history:clear'),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('history:delete', id)
  },
  promptState: {
    get: (): Promise<{ prompt: string; variables: Record<string, string> }> => ipcRenderer.invoke('promptState:get'),
    set: (prompt: string, variables: Record<string, string>): Promise<void> =>
      ipcRenderer.invoke('promptState:set', prompt, variables)
  },
  exportFile: {
    save: (opts: {
      defaultName: string;
      content: string;
      filters: { name: string; extensions: string[] }[];
    }): Promise<{ saved: boolean; filePath?: string }> => ipcRenderer.invoke('export:save', opts),
    openTemp: (opts: { fileName: string; content: string }): Promise<string> => ipcRenderer.invoke('export:openTemp', opts)
  },
  shellUtil: {
    openPath: (filePath: string): Promise<void> => ipcRenderer.invoke('shell:openPath', filePath),
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url)
  }
};

contextBridge.exposeInMainWorld('chinallm', api);

export type ChinallmApi = typeof api;
