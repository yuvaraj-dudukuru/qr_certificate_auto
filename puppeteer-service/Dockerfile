# syntax=docker/dockerfile:1.6
# -----------------------------------------------------------------------------
# Fraylon Puppeteer service
# Builds a self-contained Node 20 image with Chromium and runtime deps so
# puppeteer can launch headless inside the container. Target: Render free tier.
# -----------------------------------------------------------------------------

FROM node:20-slim AS builder
WORKDIR /app

# Skip Chromium download during npm install — we'll install the apt
# chromium below and point Puppeteer at it via PUPPETEER_EXECUTABLE_PATH.
# This keeps image size sane on Render free (300MB ceiling on free disk).
ENV PUPPETEER_SKIP_DOWNLOAD=true

COPY package.json ./
# No lockfile yet — first install in the service. Use npm install (npm ci
# would require package-lock.json). The dep set is tiny and pinned in
# package.json with caret ranges.
RUN npm install --omit=dev=false --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npx tsc -p tsconfig.json

# -----------------------------------------------------------------------------
FROM node:20-slim AS runtime
WORKDIR /app

# Chromium runtime + minimal fonts. ca-certificates so Google Fonts
# @import resolves over HTTPS at render time.
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      ca-certificates \
      fonts-liberation \
      fonts-noto-color-emoji \
      libnss3 \
      libatk-bridge2.0-0 \
      libdrm2 \
      libxkbcommon0 \
      libxcomposite1 \
      libxdamage1 \
      libxfixes3 \
      libxrandr2 \
      libgbm1 \
      libasound2 \
      libpangocairo-1.0-0 \
      libcairo2 \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PORT=8787

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY --from=builder /app/dist ./dist
COPY assets ./assets

# Run as the existing node user, not root, so --no-sandbox doesn't gain
# elevated privileges.
USER node

EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
