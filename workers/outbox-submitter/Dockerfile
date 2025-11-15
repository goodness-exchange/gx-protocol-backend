# Multi-stage Dockerfile for GX Protocol Worker (Monorepo)
# Worker: outbox-submitter

# ============================================
# Stage 1: Dependencies
# ============================================
FROM node:18-alpine AS dependencies

WORKDIR /app

# Copy package files for dependency installation
COPY package.json package-lock.json* turbo.json ./
COPY workers/outbox-submitter/package.json ./workers/outbox-submitter/
COPY packages/*/package.json ./packages/

# Install dependencies
RUN npm ci --legacy-peer-deps

# ============================================
# Stage 2: Builder
# ============================================
FROM node:18-alpine AS builder

WORKDIR /app

# Copy dependencies from previous stage
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/package.json ./

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate --schema=./db/prisma/schema.prisma

# Build all packages and the worker
RUN npm run build --filter=@gx/outbox-submitter

# ============================================
# Stage 3: Production
# ============================================
FROM node:18-alpine AS production

# Set NODE_ENV
ENV NODE_ENV=production

WORKDIR /app

# Install production dependencies only
COPY package.json package-lock.json* ./
COPY workers/outbox-submitter/package.json ./workers/outbox-submitter/
COPY packages/*/package.json ./packages/

RUN npm ci --production --legacy-peer-deps

# Copy built artifacts from builder
COPY --from=builder /app/workers/outbox-submitter/dist ./workers/outbox-submitter/dist
COPY --from=builder /app/packages/*/dist ./packages/

# Copy Prisma schema and generated client
COPY --from=builder /app/db/prisma ./db/prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy Fabric connection profiles and crypto materials
COPY --from=builder /app/workers/outbox-submitter/connection-profile.yaml ./workers/outbox-submitter/
COPY --from=builder /app/workers/outbox-submitter/crypto ./workers/outbox-submitter/crypto

# Create non-root user
RUN (addgroup -g 1001 gxprotocol || true) && \
    (adduser -D -u 1001 -G gxprotocol gxprotocol || true) && \
    chown -R gxprotocol:gxprotocol /app

USER gxprotocol

# Expose metrics port
EXPOSE 9090

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:9090/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the worker
CMD ["node", "workers/outbox-submitter/dist/index.js"]
