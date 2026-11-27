# EXORA Marketing OS — production image (Next.js + worker + Playwright renders)
FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm prune --omit=dev \
    && npm cache clean --force && rm -rf web/.next/cache

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl ffmpeg python3 python3-pip python3-venv \
    libnss3 libcups2 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libgbm1 libasound2 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://claude.ai/install.sh -o /tmp/install-claude.sh \
    && bash /tmp/install-claude.sh stable \
    && cp -L /root/.local/bin/claude /usr/local/bin/claude \
    && rm /tmp/install-claude.sh \
    && claude --version
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 EXORA_ROOT=/app
ENV FFMPEG_BIN=/usr/bin/ffmpeg
# Python for the skill scripts and brand extraction: one virtualenv built from the same requirements file and NLTK data script
# that scripts/setup-python.sh uses. The scripts run with `python -I`, which ignores PYTHONPATH, so the packages must be in the
# environment itself. NLTK data is downloaded here, at build time, not on first use. It lives outside /app/.local, which is a bind mount.
COPY scripts/python-requirements.txt scripts/download-nltk-data.py /tmp/py/
RUN python3 -m venv /opt/exora-venv \
    && /opt/exora-venv/bin/pip install --no-cache-dir -r /tmp/py/python-requirements.txt \
    && /opt/exora-venv/bin/python /tmp/py/download-nltk-data.py /opt/exora-nltk \
    && NLTK_DATA=/opt/exora-nltk /opt/exora-venv/bin/python -I -c "import textstat, nltk, pypdf, PIL; nltk.data.find('tokenizers/punkt_tab'); nltk.data.find('corpora/cmudict'); nltk.data.find('corpora/stopwords'); print('python quality dependencies OK')" \
    && rm -rf /tmp/py
ENV EXORA_PYTHON=/opt/exora-venv/bin/python PYTHON_BIN=/opt/exora-venv/bin/python NLTK_DATA=/opt/exora-nltk
RUN apt-get update && apt-get install -y --no-install-recommends tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/exora-browsers
COPY --from=build /app/node_modules/playwright-core /opt/exora-playwright
RUN --network=host node /opt/exora-playwright/cli.js install chromium
COPY --from=build /app /app
COPY scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=8s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3100/api/health').then(r=>r.json()).then(j=>process.exit(j.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node","node_modules/next/dist/bin/next","start","web","--hostname","0.0.0.0","--port","3100"]
