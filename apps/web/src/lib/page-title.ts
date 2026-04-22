import { useEffect } from 'react';

export const APP_DOC_TITLE = 'Note CMS';

/** "Section | Workspace | Note CMS" — skips empty segments; always ends with the app name. */
export function buildPageTitle(...segments: Array<string | null | undefined>): string {
  const parts = segments
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter(Boolean);
  if (parts.length === 0) return APP_DOC_TITLE;
  return `${parts.join(' | ')} | ${APP_DOC_TITLE}`;
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}
