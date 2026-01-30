# =============================================================================
# AIYOU ASSIST - API Gateway
# =============================================================================
FROM node:20-alpine AS base

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# =============================================================================
# Development
# =============================================================================
FROM base AS development

RUN npm ci
COPY . .

EXPOSE 8080
CMD ["npm", "run", "dev"]

# =============================================================================
# Production
# =============================================================================
FROM base AS production

COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 8080
CMD ["node", "src/index.js"]
