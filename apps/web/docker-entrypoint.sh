#!/bin/sh
set -e
cd /app

GRAPHQL_PATH="${GRAPHQL_PATH:-/graphql}"
PORT="${PORT:-5173}"

if [ -n "${NOTECMS_GRAPHQL_URL:-}" ]; then
  GQL_URL="$NOTECMS_GRAPHQL_URL"
elif [ -n "${PUBLIC_URL:-}" ]; then
  BASE=$(printf '%s' "$PUBLIC_URL" | sed 's|/*$||')
  GQL_URL="${BASE}${GRAPHQL_PATH}"
else
  GQL_URL=""
fi

if [ -n "$GQL_URL" ]; then
  export GQL_URL
  node -e "require('fs').writeFileSync('/app/dist/config.js', 'window.__NOTECMS_GRAPHQL_URL__ = ' + JSON.stringify(process.env.GQL_URL) + ';\\n');"
fi

exec serve -s dist -l "$PORT"
