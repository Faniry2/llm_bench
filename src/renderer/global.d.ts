import type { ChinallmApi } from '../preload/index.js';

declare global {
  interface Window {
    chinallm: ChinallmApi;
  }
}

export {};
