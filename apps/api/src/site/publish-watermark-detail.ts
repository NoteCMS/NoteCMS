/**
 * Successful `POST /api/hooks/site-build/:siteId` bodies may include `detail` with optional fields:
 * `contentRevision` (number), `bundleHash` (string), `builtAt` (ISO string), `workflowRunId` (string).
 * These are persisted on `SiteSettings.lastPublishedWatermark` when `status` is `success`.
 */
export type LastPublishedWatermark = {
  contentRevision?: number;
  bundleHash?: string;
  builtAt?: string;
  workflowRunId?: string;
};

/** Extract structured watermark fields from GitHub workflow `detail` JSON on successful publish callback. */
export function parseLastPublishedWatermarkFromDetail(detail: unknown): LastPublishedWatermark | null {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return null;
  const d = detail as Record<string, unknown>;
  const out: LastPublishedWatermark = {};
  if (typeof d.contentRevision === 'number' && Number.isFinite(d.contentRevision)) {
    out.contentRevision = Math.floor(d.contentRevision);
  }
  if (typeof d.bundleHash === 'string' && d.bundleHash.trim()) {
    out.bundleHash = d.bundleHash.trim().slice(0, 128);
  }
  if (typeof d.builtAt === 'string' && d.builtAt.trim()) {
    out.builtAt = d.builtAt.trim().slice(0, 80);
  }
  if (typeof d.workflowRunId === 'string' && d.workflowRunId.trim()) {
    out.workflowRunId = d.workflowRunId.trim().slice(0, 128);
  }
  return Object.keys(out).length ? out : null;
}
