# Self-hosting NoteCMS with Docker

## Prerequisites

- Docker Engine and Docker Compose v2
- A GitHub account if you pull images from GHCR (public images may be pulled anonymously depending on visibility)

## Images (GHCR)

Release builds publish two images when you push a Git version tag `v*` (for example `v1.0.0`):

- `ghcr.io/<your-github-org>/notecms-api:<tag>` and `:latest`
- `ghcr.io/<your-github-org>/notecms-web:<tag>` and `:latest`

The workflow is [.github/workflows/docker-publish.yml](../.github/workflows/docker-publish.yml). Pull requests run **build-only** jobs (no push) to catch broken Dockerfiles early.

## Install

1. Clone the repository (or copy `deploy/docker-compose.yml` and `.env.example` only).
2. From the repo root: `cp .env.example .env`
3. Set **at least**:
   - `JWT_SECRET` — long random string (never use `change-me` in production; the API refuses to start if the default is used when `NODE_ENV=production`).
   - `NOTECMS_API_IMAGE` and `NOTECMS_WEB_IMAGE` — full image references, e.g. `ghcr.io/myorg/notecms-api:v1.0.0` and `ghcr.io/myorg/notecms-web:v1.0.0`.
   - **Web → API URL in the browser** — one of:
     - `PUBLIC_URL` — canonical site origin **without** trailing slash (e.g. `https://cms.example.com`). The web container writes `dist/config.js` so the SPA calls `PUBLIC_URL` + `GRAPHQL_PATH` (default `/graphql`). Use this when a reverse proxy serves UI and API on the **same origin**.
     - `NOTECMS_GRAPHQL_URL` — full GraphQL HTTP URL (e.g. `http://localhost:4000/graphql` for split ports on the host). If set, it overrides the `PUBLIC_URL` + `GRAPHQL_PATH` combination.
4. `docker compose -f deploy/docker-compose.yml pull && docker compose -f deploy/docker-compose.yml up -d`

Default port bindings are **localhost only** (`127.0.0.1:4000` and `127.0.0.1:5173`). Put **Caddy**, nginx, or another reverse proxy **in front** of those ports for TLS and public hostnames; that proxy is **not** part of this repository’s compose file.

## Update

Pin image digests or tags in `.env` (e.g. `NOTECMS_*_IMAGE=...:v1.1.0`), then:

```bash
docker compose -f deploy/docker-compose.yml pull
docker compose -f deploy/docker-compose.yml up -d
```

## Data and backups

- **MongoDB**: Docker volume `mongodb_data` (see `deploy/docker-compose.yml`).
- **Uploaded assets**: volume `api_assets`, mounted at `ASSET_LOCAL_ROOT` inside the API container (default `/data/assets`).

Back up both volumes for a full restore. S3-backed asset storage is not implemented yet; use local volume only until it is.

## Environment reference

| Variable | Role |
|----------|------|
| `JWT_SECRET` | Required for auth; must not be default in production |
| `MONGO_URI` | Mongo connection string (default in compose: `mongodb://mongo:27017/notecms`) |
| `API_PORT` | Internal API listen port (default `4000`) |
| `ASSET_LOCAL_ROOT`, `ASSET_STORAGE_DRIVER`, `ASSET_MAX_UPLOAD_BYTES` | Asset storage (local driver) |
| `NOTECMS_API_IMAGE`, `NOTECMS_WEB_IMAGE` | Full image names for deploy compose |
| `PUBLIC_URL` | Public browser origin for same-origin GraphQL URL |
| `GRAPHQL_PATH` | Path segment for GraphQL (default `/graphql`) |
| `NOTECMS_GRAPHQL_URL` | Full GraphQL URL override for the SPA |
| `WEB_PORT` | Internal port for `serve` in the web container |
| `API_PUBLISH_PORT`, `WEB_PUBLISH_PORT` | Host bindings for API and web |

## Local smoke test (build images without GHCR)

From the **repository root** (context must be `.`):

```bash
docker build -f apps/api/Dockerfile -t notecms-api:local .
docker build -f apps/web/Dockerfile -t notecms-web:local .
```

You can point `NOTECMS_API_IMAGE=notecms-api:local` and `NOTECMS_WEB_IMAGE=notecms-web:local` in `.env` and use `deploy/docker-compose.yml`, or use `infra/docker-compose.yml` which builds from source for day-to-day development.

## Reverse proxy (Caddy) — external

Run Caddy (or similar) on the host or in another stack. Example: terminate TLS for `cms.example.com`, proxy `/` to `127.0.0.1:5173` and `/graphql` to `127.0.0.1:4000/graphql` if you use path-based routing on one hostname; or use two hostnames and set `PUBLIC_URL` / `NOTECMS_GRAPHQL_URL` accordingly so the browser reaches the API without CORS issues (same-origin is simplest).

## Logs

```bash
docker compose -f deploy/docker-compose.yml logs -f api
docker compose -f deploy/docker-compose.yml logs -f web
```

The API exposes GraphQL over HTTP POST at `/graphql` (Apollo Server standalone).
