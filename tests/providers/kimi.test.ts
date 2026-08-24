import { describe, expect, it, vi, afterEach } from 'vitest';
import { kimiProvider } from '../../src/providers/kimi.js';

function sseResponse(events: unknown[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    }
  });
  return new Response(body, { status: 200 });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('kimiProvider tool loop', () => {
  it('sums usage across every tool round instead of keeping only the last one', async () => {
    const round1 = sseResponse([
      {
        choices: [
          {
            delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: '$web_search', arguments: '{"query":"test"}' } }] },
            finish_reason: 'tool_calls'
          }
        ],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 }
      }
    ]);
    const round2 = sseResponse([
      {
        choices: [{ delta: { content: 'Réponse finale.' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 300, completion_tokens: 50, total_tokens: 350 }
      }
    ]);

    const fetchMock = vi.fn().mockResolvedValueOnce(round1).mockResolvedValueOnce(round2);
    vi.stubGlobal('fetch', fetchMock);

    const result = await kimiProvider.run(
      {
        prompt: 'Quelle est la météo ?',
        webSearch: true,
        signal: new AbortController().signal
      },
      'sk-fake'
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.rounds).toBe(2);
    expect(result.usage.inputTokens).toBe(400); // 100 + 300, not just the last round
    expect(result.usage.outputTokens).toBe(70); // 20 + 50
    expect(result.usage.webSearchCalls).toBe(1);
    expect(result.content).toBe('Réponse finale.');
    expect(result.status).toBe('success');
  });

  it('stops after MAX_ROUNDS to avoid an infinite tool loop', async () => {
    const alwaysToolCall = () =>
      sseResponse([
        {
          choices: [
            {
              delta: { tool_calls: [{ index: 0, id: 'call_x', function: { name: '$web_search', arguments: '{}' } }] },
              finish_reason: 'tool_calls'
            }
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        }
      ]);

    const fetchMock = vi.fn(() => Promise.resolve(alwaysToolCall()));
    vi.stubGlobal('fetch', fetchMock);

    const result = await kimiProvider.run(
      { prompt: 'boucle infinie ?', webSearch: true, signal: new AbortController().signal },
      'sk-fake'
    );

    expect(fetchMock).toHaveBeenCalledTimes(8);
    expect(result.rounds).toBe(8);
  });
});
