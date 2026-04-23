# Contributing to NoteCMS

Thanks for helping improve NoteCMS.

## Before you start

- Read the main setup guide in [`README.md`](README.md)
- Keep changes focused and small when possible
- Open an issue first for larger feature work

## Development flow

1. Fork or create a branch from `master`
2. Run locally:
   - `npm install`
   - `npm run dev -w @note/api`
   - `npm run dev -w @note/web`
3. Make your changes
4. Run checks before opening a PR:
   - `npm run build`
   - `npm run test`

## Pull request expectations

- Clear title and short description of why the change is useful
- Screenshots for UI changes
- Notes about env vars or migration steps if applicable

## Style notes

- TypeScript first
- Keep docs in sync when behavior changes
- Avoid unrelated refactors in feature/fix PRs
