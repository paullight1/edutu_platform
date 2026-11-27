FROM node:24-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/opt/playwright-browsers \
    AUTO_APPLY_BUNDLED_CHROMIUM=true \
    AUTO_APPLY_PROVIDER_BIND_HOST=0.0.0.0 \
    AUTO_APPLY_PROVIDER_PORT=7718 \
    AUTO_APPLY_FORMS_FILE=/config/forms.json \
    AUTO_APPLY_REQUIRE_RECEIPT_MOUNT=true \
    AUTO_APPLY_RECEIPTS_DIR=/var/lib/edutu-auto-apply

COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
    && node node_modules/playwright-core/cli.js install --with-deps --only-shell chromium \
    && npm cache clean --force \
    && rm -rf /var/lib/apt/lists/* \
    && install -d -m 0700 -o node -g node /var/lib/edutu-auto-apply

COPY browser-provider.mjs ./
USER node
EXPOSE 7718
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s \
  CMD node -e 'fetch("http://127.0.0.1:" + process.env.AUTO_APPLY_PROVIDER_PORT + "/healthz").then(response => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))'
CMD ["node", "browser-provider.mjs"]
