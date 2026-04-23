#!/usr/bin/env node
/**
 * Writes dist/serve.json for `serve` so the static admin UI gets CSP + security headers.
 * Run after dist exists (e.g. from docker-entrypoint.sh). Uses deploy env for connect-src.
 */
import fs from 'node:fs';
import path from 'node:path';

const distDir = process.argv[2] || path.join(process.cwd(), 'dist');
const outFile = path.join(distDir, 'serve.json');

/** @param {string | undefined} raw */
function originFromUrl(raw) {
  if (!raw || !String(raw).trim()) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

const connectParts = new Set(["'self'"]);

for (const envKey of ['NOTECMS_GRAPHQL_URL', 'PUBLIC_URL', 'VITE_NOTECMS_GRAPHQL_URL']) {
  const o = originFromUrl(process.env[envKey]);
  if (o) connectParts.add(o);
}

const extra = process.env.CSP_CONNECT_SRC_EXTRA?.split(/[\s,]+/).filter(Boolean) ?? [];
for (const part of extra) {
  if (part === 'http:' || part === 'https:' || part === 'ws:' || part === 'wss:') {
    connectParts.add(part);
  } else if (part.startsWith('http://') || part.startsWith('https://')) {
    const o = originFromUrl(part);
    if (o) connectParts.add(o);
  } else {
    connectParts.add(part);
  }
}

const portOnly =
  Boolean(process.env.NOTECMS_GRAPHQL_PORT?.trim()) &&
  !process.env.NOTECMS_GRAPHQL_URL?.trim() &&
  !process.env.PUBLIC_URL?.trim();

if (portOnly) {
  connectParts.add('http:');
  connectParts.add('https:');
}

const connectSrc = [...connectParts].join(' ');

const csp = [
  "default-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob:`,
  `font-src 'self' data:`,
  `connect-src ${connectSrc}`,
  "worker-src 'self' blob:",
].join('; ');

const headers = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'X-Frame-Options', value: 'DENY' },
];

const config = {
  headers: [
    {
      source: '**',
      headers,
    },
  ],
};

fs.mkdirSync(distDir, { recursive: true });
fs.writeFileSync(outFile, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
console.log(`Wrote ${outFile}`);
