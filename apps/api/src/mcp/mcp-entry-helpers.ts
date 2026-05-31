import { countEntryBlocks, hashEntryData } from '../site/entry-data-guard.js';

export function omitUndefinedVariables(vars: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(vars).filter(([, value]) => value !== undefined));
}

export function buildUpdateEntryVariables(args: {
  id: string;
  siteId?: string;
  name?: string;
  slug?: string;
  data?: Record<string, unknown>;
  metaTitle?: string;
  metaDescription?: string;
}): Record<string, unknown> {
  const vars: Record<string, unknown> = { id: args.id };
  if (args.siteId !== undefined) vars.siteId = args.siteId;
  if (args.name !== undefined) vars.name = args.name;
  if (args.slug !== undefined) vars.slug = args.slug;
  if (args.data !== undefined) vars.data = args.data;
  if (args.metaTitle !== undefined || args.metaDescription !== undefined) {
    vars.meta = {
      ...(args.metaTitle !== undefined ? { title: args.metaTitle } : {}),
      ...(args.metaDescription !== undefined ? { description: args.metaDescription } : {}),
    };
  }
  return vars;
}

type PublishedEntryPayload = {
  id: string;
  meta?: { title?: string | null; description?: string | null } | null;
  data?: Record<string, unknown> | null;
  lifecycleStatus?: string | null;
  [key: string]: unknown;
};

export function enrichPublishEntryResponse(result: { publishEntry: PublishedEntryPayload }) {
  const entry = result.publishEntry;
  const data = entry.data && typeof entry.data === 'object' && !Array.isArray(entry.data) ? entry.data : {};
  return {
    ...result,
    publishEntry: {
      ...entry,
      verification: {
        meta: entry.meta ?? { title: null, description: null },
        blockCount: countEntryBlocks(data),
        publishedDataHash: hashEntryData(data),
      },
    },
  };
}
