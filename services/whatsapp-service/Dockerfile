# =============================================================================
# AIYOU ASSIST - WhatsApp Service (ClaudBot Adapter)
# =============================================================================
FROM node:20-alpine AS base

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

# =============================================================================
# Production
# =============================================================================
FROM base AS production

COPY . .

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 8002
CMD ["node", "src/index.js"]
