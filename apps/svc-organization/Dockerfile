# Multi-stage Dockerfile for GX Protocol Service (Monorepo)
# Service: svc-organization

# ============================================
# Stage 1: Dependencies
# ============================================
FROM node:18-alpine AS dependencies

WORKDIR /app

# Copy package files for dependency installation
COPY package.json package-lock.json* turbo.json ./
COPY apps/svc-organization/package.json ./apps/svc-organization/
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

# Build all packages and the service
RUN npm run build --filter=@gx/svc-organization

# ============================================
# Stage 3: Production
# ============================================
FROM node:18-alpine AS production

# Set NODE_ENV
ENV NODE_ENV=production

WORKDIR /app

# Install production dependencies only
COPY package.json package-lock.json* ./
COPY apps/svc-organization/package.json ./apps/svc-organization/
COPY packages/*/package.json ./packages/

RUN npm ci --production --legacy-peer-deps

# Copy built artifacts from builder
COPY --from=builder /app/apps/svc-organization/dist ./apps/svc-organization/dist
COPY --from=builder /app/packages/*/dist ./packages/

# Copy Prisma schema and generated client
COPY --from=builder /app/db/prisma ./db/prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Create non-root user
RUN (addgroup -g 1001 gxprotocol || true) && \
    (adduser -D -u 1001 -G gxprotocol gxprotocol || true) && \
    chown -R gxprotocol:gxprotocol /app

USER gxprotocol

# Expose service port
EXPOSE 3003

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3003/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the service
CMD ["node", "apps/svc-organization/dist/index.js"]
