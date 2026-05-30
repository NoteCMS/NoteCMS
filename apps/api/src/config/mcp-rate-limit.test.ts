import { describe, expect, it } from 'vitest';
import { mcpUnauthRateLimitKey, mcpRequestHasCredential } from './mcp-rate-limit.js';

function req(headers: Record<string, string>, ip = '127.0.0.1') {
  return { headers, ip } as Parameters<typeof mcpUnauthRateLimitKey>[0];
}

describe('mcp rate limit keys', () => {
  it('detects x-api-key and bearer credentials', () => {
    expect(mcpRequestHasCredential(req({ 'x-api-key': 'ncms_v1_abc' }))).toBe(true);
    expect(mcpRequestHasCredential(req({ authorization: 'Bearer ncms_v1_abc' }))).toBe(true);
    expect(mcpRequestHasCredential(req({ authorization: 'Bearer eyJhbG' }))).toBe(true);
    expect(mcpRequestHasCredential(req({}))).toBe(false);
  });

  it('buckets unauthenticated traffic by IP', () => {
    expect(mcpUnauthRateLimitKey(req({}, '10.0.0.1'))).toBe('mcp:ip:10.0.0.1');
    expect(mcpUnauthRateLimitKey(req({}, '10.0.0.2'))).toBe('mcp:ip:10.0.0.2');
  });
});
