FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN groupadd --system --gid 1001 voice \
  && useradd --system --uid 1001 --gid voice voice

COPY --from=builder --chown=voice:voice /app/package.json /app/package-lock.json ./
COPY --from=builder --chown=voice:voice /app/node_modules ./node_modules
COPY --from=builder --chown=voice:voice /app/dist ./dist

USER voice
EXPOSE 4000/tcp
EXPOSE 40000/tcp
EXPOSE 40000/udp
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "--input-type=module", "-e", "const r=await fetch(`http://127.0.0.1:${process.env.PORT ?? 4000}/health`);if(!r.ok)process.exit(1)"]
CMD ["node", "dist/index.js"]
