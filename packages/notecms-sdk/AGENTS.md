# @notecms/sdk — guide for AI agents

## Routing and static site URLs

**Read first:** [docs/ROUTING.md](./docs/ROUTING.md)

Use that document whenever the task involves permalinks, homepage (`/`), content-type URL prefixes, SSG path lists, or resolving CMS entries from a pathname.

### Routing cheat sheet

```
SSG path list     → fetchBuildSnapshot(cms) then listStaticPaths(snapshot)
Entry by URL slug → snapshot.slugIndex[contentTypeSlug][entrySlug]
Single entry path → defaultPathForEntry(typeSlug, entry, contentType)
CMS options       → contentType.options: hasSlug, permalinkTemplate, homepage, archiveEnabled, archivePath
```

### Keywords → ROUTING.md

`listStaticPaths`, `fetchBuildSnapshot`, `permalinkTemplate`, `homepage`, `hasSlug`, `archiveEnabled`, `buildCanonicalPath`, `canonicalPath`, `buildRouteManifest`, `slugIndex`, `generateStaticParams`, `getStaticPaths`

## Security

Never use `VITE_*` / `NEXT_PUBLIC_*` for `NOTECMS_API_KEY`. Server-only: SvelteKit `$env/static/private`, Next server components, Node scripts, CI.

## Dev vs production client

| Client | When |
|--------|------|
| `createDevNoteCmsClient` | Local dev; `cache: 'no-store'` |
| `createNoteCmsClient` | Production / SSG builds |

## Other docs

- Human-oriented overview: [README.md](./README.md)
- GraphQL operation strings: `src/operations.ts`
- MCP (API agents): README § MCP — `/api/mcp` on the API host
