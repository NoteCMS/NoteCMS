export const FRONTEND_SDK_MARKDOWN = `# Note CMS — frontend code (@notecms/sdk)

MCP tools **manage** the CMS. Your **website/app reads** content via GraphQL using \`@notecms/sdk\` — typically from **server-only** code (SSR, SSG, API routes).

\`\`\`bash
npm install @notecms/sdk
\`\`\`

---

## Security (non-negotiable)

- **Never** put \`NOTECMS_API_KEY\` in \`VITE_*\`, \`NEXT_PUBLIC_*\`, or any client bundle.
- Use server-only env: SvelteKit \`$env/static/private\`, Next.js Server Components / Route Handlers, Node scripts, CI.

Read-only keys are fine for production builds. Use separate write-capable keys only in MCP/CI automation.

---

## Minimal read example (SvelteKit)

\`\`\`ts
// src/routes/about/+page.server.ts
import { NOTECMS_API_KEY, NOTECMS_GRAPHQL_URL } from '$env/static/private';
import { createDevNoteCmsClient } from '@notecms/sdk';

export const load = async () => {
  const cms = createDevNoteCmsClient({
    endpoint: NOTECMS_GRAPHQL_URL,
    apiKey: NOTECMS_API_KEY,
  });
  const page = await cms.entryBySlug('pages', 'about');
  return { page };
};
\`\`\`

\`\`\`svelte
<!-- +page.svelte -->
<script lang="ts">
  let { data } = $props();
</script>

<h1>{data.page?.name}</h1>
{@html data.page?.data?.body}
\`\`\`

Use \`createDevNoteCmsClient\` in dev (\`cache: 'no-store'\`). Use \`createNoteCmsClient\` for production SSG builds.

---

## Static site (SSG) — fetch all paths

\`\`\`ts
import { createNoteCmsClient, fetchBuildSnapshot, listStaticPaths } from '@notecms/sdk';

const cms = createNoteCmsClient({
  endpoint: process.env.NOTECMS_GRAPHQL_URL!,
  apiKey: process.env.NOTECMS_API_KEY!,
});

const snapshot = await fetchBuildSnapshot(cms);
const paths = listStaticPaths(snapshot);
// [{ path: "/", typeSlug: "pages", slug: "home" }, { path: "/about", … }, …]
\`\`\`

**Next.js App Router** — drive \`generateStaticParams\` from \`paths\`.

**SvelteKit** — drive \`entries()\` from \`paths\` (see \`note-cms://docs/routing\`).

---

## Resolve entry from URL

After \`fetchBuildSnapshot\`:

\`\`\`ts
const entry = snapshot.slugIndex['pages']?.['about'];
// or
import { defaultPathForEntry } from '@notecms/sdk';
const path = defaultPathForEntry('pages', entry, contentType);
\`\`\`

Do **not** hard-code URL patterns — they come from content type \`options\` in the CMS.

---

## Image fields in templates

Entry \`data.hero\` shape: \`{ assetId, variant? }\`. The SDK snapshot / GraphQL may expose hydrated URLs on read. In MCP you only get ids — the site resolves URLs via GraphQL asset fields or your own asset query.

Typical pattern: use repeater/blocks in \`data\`, render \`<img src={…} alt={…} />\` from resolved asset URLs in the server load function.

---

## Dev vs production client

| Client | When |
|--------|------|
| \`createDevNoteCmsClient\` | Local dev — always fresh CMS data |
| \`createNoteCmsClient\` | Production build / CI |

Both accept \`endpoint\`, \`apiKey\`, optional \`siteId\` (auto-resolved from key via \`apiKeyInfo\`).

---

## Environment variables (typical)

\`\`\`env
NOTECMS_GRAPHQL_URL=https://cms.example.com/graphql
NOTECMS_API_KEY=ncms_v1_…
# optional if key is site-scoped:
NOTECMS_SITE_ID=…
\`\`\`

---

## MCP vs SDK — division of labor

| Task | Use |
|------|-----|
| Agent edits content, uploads, publishes | **MCP tools** (this server) |
| Site renders pages, SSG, routing | **@notecms/sdk** in app repo |
| Schema design in admin UI | Dashboard or \`notecms_*_content_type\` |

Package docs in repo: \`packages/notecms-sdk/README.md\`, \`docs/ROUTING.md\`, \`AGENTS.md\`.
`;
