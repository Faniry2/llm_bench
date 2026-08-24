import { describe, expect, it, vi, afterEach } from 'vitest';
import { mapCommonUsage, streamChatCompletion } from '../../src/providers/base.js';

function sseResponse(events: unknown[], status = 200): Response {
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
  return new Response(body, { status });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('mapCommonUsage', () => {
  it('maps DeepSeek-style cache fields', () => {
    const usage = mapCommonUsage({
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
      prompt_cache_hit_tokens: 40,
      prompt_cache_miss_tokens: 60
    });
    expect(usage.inputTokens).toBe(100);
    expect(usage.cachedInputTokens).toBe(40);
    expect(usage.outputTokens).toBe(50);
  });

  it('maps reasoning tokens from completion_tokens_details', () => {
    const usage = mapCommonUsage({
      prompt_tokens: 10,
      completion_tokens: 20,
      completion_tokens_details: { reasoning_tokens: 8 }
    });
    expect(usage.reasoningTokens).toBe(8);
  });

  it('defaults to zeroed usage when nothing is provided', () => {
    const usage = mapCommonUsage(undefined);
    expect(usage.inputTokens).toBe(0);
    expect(usage.totalTokens).toBe(0);
  });
});

describe('streamChatCompletion', () => {
  it('accumulates streamed content and captures usage from the final chunk', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          { choices: [{ delta: { content: 'Bonjour' }, finish_reason: null }] },
          { choices: [{ delta: { content: ' le monde' }, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 3 } }
        ])
      )
    );

    const result = await streamChatCompletion({
      baseUrl: 'https://example.test',
      apiKey: 'sk-test',
      signal: new AbortController().signal,
      body: { model: 'test', messages: [{ role: 'user', content: 'hi' }] }
    });

    expect(result.content).toBe('Bonjour le monde');
    expect(result.finishReason).toBe('stop');
    expect(result.usage?.prompt_tokens).toBe(5);
  });

  it('retries once on a 500 then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('server error', { status: 500 }))
      .mockResolvedValueOnce(sseResponse([{ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }]));
    vi.stubGlobal('fetch', fetchMock);

    const result = await streamChatCompletion({
      baseUrl: 'https://example.test',
      apiKey: 'sk-test',
      signal: new AbortController().signal,
      body: { model: 'test', messages: [] },
      maxRetries: 3
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.content).toBe('ok');
  });

  it('does not retry on a 400', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('bad request', { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      streamChatCompletion({
        baseUrl: 'https://example.test',
        apiKey: 'sk-test',
        signal: new AbortController().signal,
        body: { model: 'test', messages: [] },
        maxRetries: 3
      })
    ).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('accumulates tool_calls arguments split across multiple deltas', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          {
            choices: [
              {
                delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: '$web_search', arguments: '{"q":' } }] },
                finish_reason: null
              }
            ]
          },
          {
            choices: [
              {
                delta: { tool_calls: [{ index: 0, function: { arguments: '"test"}' } }] },
                finish_reason: 'tool_calls'
              }
            ]
          }
        ])
      )
    );

    const result = await streamChatCompletion({
      baseUrl: 'https://example.test',
      apiKey: 'sk-test',
      signal: new AbortController().signal,
      body: { model: 'test', messages: [] }
    });

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].function.arguments).toBe('{"q":"test"}');
    expect(result.finishReason).toBe('tool_calls');
  });
});
