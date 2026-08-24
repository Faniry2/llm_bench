import { getEncoding } from 'js-tiktoken';

let cachedEncoding: ReturnType<typeof getEncoding> | null = null;

function encoding() {
  if (!cachedEncoding) cachedEncoding = getEncoding('cl100k_base');
  return cachedEncoding;
}

/** Best-effort token count used only when a provider fails to return `usage`. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  try {
    return encoding().encode(text).length;
  } catch {
    return Math.ceil(text.length / 4);
  }
}
