FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/ui/package.json ./packages/ui/package.json
COPY packages/types/package.json ./packages/types/package.json
COPY packages/notecms-sdk/package.json ./packages/notecms-sdk/package.json
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build -w @note/api

FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache wget
ENV NODE_ENV=production
COPY --from=build /app/apps/api/dist ./dist
COPY apps/api/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=5 \
  CMD wget -qO- --header='content-type: application/json' --post-data='{"query":"{__typename}"}' http://127.0.0.1:4000/graphql >/dev/null || exit 1
CMD ["node", "dist/index.js"]
