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

If you use [Portless](https://github.com/doyouevenport/portless) for stable local hostnames:

```bash
npm run dev:portless
```

This gives you local URLs like:

- `https://web.notecms.localhost`
- `https://api.notecms.localhost`

## Self-hosting / production

Use `deploy/docker-compose.yml` with published images. Full guide:

- [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md)

## API and MCP docs

- GraphQL + scoped API keys + MCP details:
  - [`apps/api/docs/mcp-and-scoped-keys.md`](apps/api/docs/mcp-and-scoped-keys.md)
- SDK usage:
  - [`packages/notecms-sdk/README.md`](packages/notecms-sdk/README.md)

## Scripts (root)

- `npm run dev` - run API + web in parallel
- `npm run dev:db` - start only Mongo via Docker
- `npm run dev:full` - Mongo + local dev apps
- `npm run dev:portless` - API + web under Portless
- `npm run dev:full:portless` - Mongo + Portless apps
- `npm run build` - build all workspaces
- `npm run test` - run workspace tests where available

## Contributing

Small improvements and bug fixes are welcome. See [`CONTRIBUTING.md`](CONTRIBUTING.md).
