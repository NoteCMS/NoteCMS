# Note CMS (v1)

Lightweight, multi-tenant, headless CMS with an organic-styled admin UI.

## Stack

- React 19 + Vite + Tailwind CSS 4
- Node.js 22 + TypeScript + Apollo Server 5 + GraphQL.js
- MongoDB 8
- Docker Compose deployment

## Workspace

- `apps/web`: admin frontend
- `apps/api`: GraphQL backend
- `packages/ui`: design tokens and reusable UI primitives
- `packages/types`: shared field and role types
- `packages/notecms-sdk`: publishable headless client (`@notecms/sdk`) for static sites and server-side fetches
- `infra/docker-compose.yml`: local container orchestration (build from source)
- `deploy/docker-compose.yml`: production-style stack using pre-built images from GHCR — see [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md)

## Local dev (without Docker)

1. `cp .env.example .env`
2. `npm install`
3. Start MongoDB locally on `mongodb://localhost:27017/notecms` or use Docker mongo only
4. `npm run dev -w @note/api`
5. `npm run dev -w @note/web`
6. Set `BOOTSTRAP_ADMIN_EMAIL` in `.env` (first admin; no password until you set it in the UI — see below). Optionally run `npm run seed -w @note/api` to apply the same bootstrap without starting the API.

## Docker

**Development (build from source):** from project root, `docker compose -f infra/docker-compose.yml up --build`.

**Self-hosted install / updates** with published images: [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md).

## First admin user

With `BOOTSTRAP_ADMIN_EMAIL` set, the API creates that admin **without a password** on startup (and a small demo site). Sign in with that email and a **blank password**; you will be prompted to choose a password. Optionally set **`BOOTSTRAP_SECRET`** if you want a one-time “setup key” in addition to knowing the admin email.

## Implemented v1 features

- Site-scoped authentication and RBAC (`owner/admin/editor/viewer`)
- Multi-site membership scoping for all content access
- Dynamic content types with standard field types
- Recursive repeater field validation and rendering
- Schema-driven entry editor in admin UI
- Organic design tokens and core components
- API unit test for nested repeater validation