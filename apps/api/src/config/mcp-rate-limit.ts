import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from './env.js';

/** True when the client sent a credential MCP would accept (before verification). */
export function mcpRequestHasCredential(req: Request): boolean {
  const xKey = req.headers['x-api-key'];
  if (typeof xKey === 'string' && xKey.trim()) return true;
  const auth = req.headers.authorization;
  return typeof auth === 'string' && auth.trim().toLowerCase().startsWith('bearer ');
}

/** Bucket unauthenticated probes by client IP. */
export function mcpUnauthRateLimitKey(req: Request): string {
  return `mcp:ip:${req.ip ?? 'unknown'}`;
}

export function createMcpLimiter() {
  if (env.mcpRateLimitUnauthMax <= 0) {
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }
  return rateLimit({
    windowMs: env.mcpRateLimitWindowMs,
    limit: env.mcpRateLimitUnauthMax,
    skip: (req) => mcpRequestHasCredential(req),
    keyGenerator: mcpUnauthRateLimitKey,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { message: 'Too many MCP requests; try again later.' },
  });
}
