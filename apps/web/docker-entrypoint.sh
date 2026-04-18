#!/bin/sh
set -e
cd /app

GRAPHQL_PATH="${GRAPHQL_PATH:-/graphql}"
PORT="${PORT:-5173}"

write_full_url() {
  export GQL_URL="$1"
  node -e "require('fs').writeFileSync('/app/dist/config.js', 'window.__NOTECMS_GRAPHQL_URL__ = ' + JSON.stringify(process.env.GQL_URL) + ';\\n');"
}

write_port_only() {
  export GQL_PORT="$1"
  export G_PATH="$2"
  node <<'NODE'
const fs = require('fs');
const port = process.env.GQL_PORT;
let p = process.env.G_PATH || '/graphql';
if (!p.startsWith('/')) p = '/' + p;
const body =
  'window.__NOTECMS_GRAPHQL_PORT__ = ' + JSON.stringify(port) + ';\n' +
  'window.__NOTECMS_GRAPHQL_PATH__ = ' + JSON.stringify(p) + ';\n';
fs.writeFileSync('/app/dist/config.js', body);
NODE
}

if [ -n "${NOTECMS_GRAPHQL_URL:-}" ]; then
  write_full_url "$NOTECMS_GRAPHQL_URL"
elif [ -n "${PUBLIC_URL:-}" ]; then
  BASE=$(printf '%s' "$PUBLIC_URL" | sed 's|/*$||')
  write_full_url "${BASE}${GRAPHQL_PATH}"
elif [ -n "${NOTECMS_GRAPHQL_PORT:-}" ]; then
  write_port_only "$NOTECMS_GRAPHQL_PORT" "$GRAPHQL_PATH"
fi

exec serve -s dist -l "$PORT"
