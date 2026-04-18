FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/ui/package.json ./packages/ui/package.json
COPY packages/types/package.json ./packages/types/package.json
RUN npm install

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build -w @note/web

FROM node:22-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=build /app/apps/web/dist ./dist
COPY apps/web/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh
EXPOSE 5173
ENV PORT=5173
ENTRYPOINT ["/app/docker-entrypoint.sh"]
