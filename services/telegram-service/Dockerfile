FROM node:22-alpine AS base

WORKDIR /app

COPY package.json package-lock.json* ./

FROM base AS production

RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

COPY . .

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

EXPOSE 8005

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8005/health || exit 1

CMD ["node", "src/index.js"]
