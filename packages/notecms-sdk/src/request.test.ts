import { describe, expect, it, vi } from 'vitest';
import { NoteCmsError } from './errors.js';
import { postGraphql } from './request.js';

describe('postGraphql', () => {
  it('returns data on success', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ data: { hello: 'world' } }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const data = await postGraphql<{ hello: string }>(
      'https://cms.example/graphql',
      { query: '{ __typename }' },
      { apiKey: 'ncms_v1_' + 'a'.repeat(24) + '_' + 'b'.repeat(64), fetchImpl, fetchInit: { cache: 'no-store' } },
    );
    expect(data.hello).toBe('world');
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.cache).toBe('no-store');
    expect((init.headers as Headers).get('authorization')).toMatch(/^Bearer /);
  });

  it('throws NoteCmsError with GraphQL errors array', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            errors: [{ message: 'boom', extensions: { code: 'BAD' } }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    try {
      await postGraphql('https://cms.example/graphql', { query: '{}' }, { apiKey: 'k', fetchImpl });
      expect.fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(NoteCmsError);
      const err = e as NoteCmsError;
      expect(err.message).toBe('boom');
      expect(err.status).toBe(200);
      expect(err.errors[0]?.extensions?.code).toBe('BAD');
    }
  });

  it('maps HTTP failure to NoteCmsError', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 502 }));
    await expect(postGraphql('https://cms.example/graphql', { query: '{}' }, { apiKey: 'k', fetchImpl })).rejects.toThrow(
      NoteCmsError,
    );
  });
});
