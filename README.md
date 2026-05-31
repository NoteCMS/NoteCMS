# NoteCMS

Open-source, multi-site headless CMS with a clean admin UI, GraphQL API, and an MCP endpoint for AI workflows.

## What you get

- Multi-site workspace model with role-based access (`owner`, `admin`, `editor`, `viewer`)
- Schema-driven content types and entries
- Asset library with local storage
- GraphQL API at `/graphql`
- MCP (Streamable HTTP) endpoint at `/api/mcp`
- TypeScript SDK (`@notecms/sdk`) for server-side and static site pipelines

## How the CMS workflow works

NoteCMS follows a hybrid workflow inspired by WordPress custom post types plus advanced custom fields, but built as a headless system.

1. **Define a content type**
  Think of this like creating a custom post type (`Pages`, `Blog posts`, `Team members`, etc).
2. **Design fields for that type**
  Add structured fields (text, rich text, number, image, repeater, relations, etc), similar to an advanced custom fields setup.
3. **Create entries from that schema**
  Editors fill in a generated form that matches your field definitions. Validation and visibility rules are schema-driven.
4. **Deliver content through API/SDK**
  Your frontend (Next.js, SvelteKit, Astro, static pipeline, etc) reads the content through GraphQL or `@notecms/sdk`.

The benefit is a flexible editor experience for non-developers, while developers keep strongly structured content and predictable API output.

## Repository layout

- `apps/api` - API server (Express + GraphQL + MCP)
- `apps/web` - Admin app (React + Vite)
- `packages/notecms-sdk` - Headless SDK package
- `infra/docker-compose.yml` - local development stack (build from source)
- `deploy/docker-compose.yml` - production-style stack (prebuilt images)

## Requirements

- Node.js 22+
- npm 10+
- MongoDB 8+ (local service or Docker)

## Quick start (local, no Docker)

1. Clone and enter the repo.
2. Create env file: `cp .env.example .env`
3. Set at least:
  - `JWT_SECRET` (for local dev any non-empty string is fine)
  - `BOOTSTRAP_ADMIN_EMAIL` (for first admin login)
4. Install dependencies: `npm install`
5. Start MongoDB (local service or Docker)
6. Run apps:
  - `npm run dev -w @note/api`
  - `npm run dev -w @note/web`
7. Open `http://localhost:5173`

## First login

When `BOOTSTRAP_ADMIN_EMAIL` is set, the API creates that admin without a password.

- Sign in with that email and a blank password
- You will be asked to set an initial password
- Optional: set `BOOTSTRAP_SECRET` to require a setup key during this step

## Local with Docker (build from source)

From the repository root:

```bash
docker compose -f infra/docker-compose.yml up --build
```

This starts Mongo, API, and web together for local development.

## Portless local HTTPS hostnames (optional)

If you use [Portless](https://github.com/doyouevenport/portless) for stable local hostnames, use the **project** CLI (no global install needed): `npx portless …` from the repo root, or **`npm run portless:proxy`** to start the HTTPS proxy.

```bash
npm run dev:portless
```

Open the admin UI at **`https://web.notecms.localhost`** (not `127.0.0.1` alone). The web app uses `vite --mode portless` so [`apps/web/.env.portless`](apps/web/.env.portless) wires same-origin `/graphql` → the API proxy even when your shell does not forward env vars through Portless.

Root [`portless.json`](portless.json) registers workspace apps so names stay aligned with `web.notecms` / `api.notecms`. If Portless shows 404 or “cannot find the app”, confirm Vite is listening on the assigned port: `portless list`, then `curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:<port>/` should return `200`.

Local URLs:

- `https://web.notecms.localhost` — admin (Vite + proxy)
- `https://api.notecms.localhost` — API (`/graphql`, `/api/mcp`, `/hooks/…`)

## Self-hosting / production

Use `deploy/docker-compose.yml` with published images. Full guide:

- [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md)

## API and MCP docs

- GraphQL + scoped API keys + MCP details:
  - `[apps/api/docs/mcp-and-scoped-keys.md](apps/api/docs/mcp-and-scoped-keys.md)`
- SDK usage:
  - `[packages/notecms-sdk/README.md](packages/notecms-sdk/README.md)`

## Static site snapshots

Consumers integrate via **`fetchBuildSnapshot`** in `@notecms/sdk` during CI/static builds (between publishes). Use **`createDevNoteCmsClient`** in dev when you want live CMS reads without waiting for a build.

## Deploy webhooks (GitHub Actions)

Per-workspace **outbound** webhooks call GitHub’s [`repository_dispatch`](https://docs.github.com/en/rest/repos/repos#create-a-repository-dispatch-event) API when an editor (or owner) runs a build from **Site settings**. **Inbound** completion is optional: GitHub Actions can `POST` back to the API when a workflow finishes so the CMS records last status.

**Environment (API)**

- GitHub PATs at rest are encrypted with the same key material as **`JWT_SECRET`** unless you set optional **`PUBLISH_WEBHOOK_ENCRYPTION_KEY`** (use that only if you want PAT ciphertext isolated from JWT rotation).
- `PUBLIC_API_BASE_URL` — public origin of this API with no trailing slash (for example `https://api.example.com` or your CMS hostname when `/api/*` is proxied to the API). Required so the admin UI can generate the completion callback URL (`POST /api/hooks/site-build/:siteId/...` with `?token=`).
- Optional: `HOOKS_RATE_LIMIT_MAX`, `HOOKS_RATE_LIMIT_WINDOW_MS` — rate limit for the public callback route (per IP).

**GitHub workflow**

1. Add `on: repository_dispatch: types: [your_event_type]` matching the event type configured in the CMS.
2. Each Run from the CMS includes a **one-time completion URL** in `github.event.client_payload.buildCallbackUrl`. POST to that URL when the workflow finishes (success or failure) — no repository secret required.
3. Optional legacy: generate a **static completion link** in site settings if your workflow cannot read `client_payload`. Store that full URL as a repository secret (for example `CMS_BUILD_CALLBACK_URL`).
4. At the end of the workflow (success or failure), POST JSON to the callback URL (no separate Bearer secret needed when using the full URL from `buildCallbackUrl`):

```yaml
- name: Tell Note CMS the build finished
  if: always()
  env:
    CALLBACK_URL: ${{ github.event.client_payload.buildCallbackUrl }}
  run: |
    if [ -z "$CALLBACK_URL" ]; then
      echo "No buildCallbackUrl in dispatch payload; skipping CMS callback."
      exit 0
    fi
    curl -sS -X POST "$CALLBACK_URL" \
      -H "Content-Type: application/json" \
      -d '{"status":"'"${{ job.status == 'success' && 'success' || 'failure' }}"'","runUrl":"'"$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID"'"}'
```

Legacy static secret workflow:

```bash
curl -sS -X POST "$CMS_BUILD_CALLBACK_URL" \
  -H "Content-Type: application/json" \
  -d '{"status":"success","runUrl":"'"$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID"'"}'
```

Allowed `status` values: `success`, `failure`, `cancelled`. Optional fields: `runUrl` (string), `detail` (JSON, capped server-side).

When `status` is **`success`**, the API may persist **`lastPublishedWatermark`** on site settings if `detail` includes fields such as **`contentRevision`**, **`bundleHash`**, **`builtAt`**, **`workflowRunId`** — useful to align “what shipped” with CMS revisions.

## Scripts (root)

- `npm run dev` - run API + web in parallel
- `npm run dev:db` - start only Mongo via Docker
- `npm run dev:full` - Mongo + local dev apps
- `npm run dev:portless` - API + web under Portless
- `npm run dev:full:portless` - Mongo + Portless apps
- `npm run build` - build all workspaces
- `npm run test` - run workspace tests where available

## Contributing

Small improvements and bug fixes are welcome. See `[CONTRIBUTING.md](CONTRIBUTING.md)`.