# EXORA Marketing OS — production image (Next.js + worker + Playwright renders)
FROM node:20-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm prune --omit=dev

FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates ffmpeg python3 python3-pip \
    libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libgbm1 libasound2 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 EXORA_ROOT=/app
ENV FFMPEG_BIN=/usr/bin/ffmpeg PYTHON_BIN=/usr/bin/python3
COPY --from=build /app /app
RUN npx playwright install chromium
COPY scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=8s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3100/api/health').then(r=>r.json()).then(j=>process.exit(j.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node","node_modules/next/dist/bin/next","start","web","--hostname","0.0.0.0","--port","3100"]
