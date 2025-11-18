# Multi-stage Dockerfile for GX Protocol Service (Monorepo)
# Service: svc-identity

# ============================================
# Stage 1: Dependencies
# ============================================
FROM node:18-alpine AS dependencies

WORKDIR /app

# Copy package files for dependency installation
COPY package.json package-lock.json* turbo.json ./
COPY apps/svc-identity/package.json ./apps/svc-identity/
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
RUN npm run build --filter=@gx/svc-identity

# ============================================
# Stage 3: Production
# ============================================
FROM node:18-alpine AS production

# Set NODE_ENV
ENV NODE_ENV=production

WORKDIR /app

# Install production dependencies only
COPY package.json package-lock.json* ./
COPY apps/svc-identity/package.json ./apps/svc-identity/
COPY packages/ ./packages/

RUN npm ci --production --legacy-peer-deps --ignore-scripts

# Copy built artifacts from builder
COPY --from=builder /app/apps/svc-identity/dist ./apps/svc-identity/dist
COPY --from=builder /app/packages/ ./packages/

# Copy Prisma schema
COPY --from=builder /app/db/prisma ./db/prisma

# Generate Prisma client in production stage
RUN npx prisma generate --schema=./db/prisma/schema.prisma

# Copy generated Prisma client to root node_modules (monorepo fix)
RUN cp -r /app/packages/core-db/node_modules/.prisma /app/node_modules/

# Create non-root user
RUN (addgroup -g 1001 gxprotocol || true) && \
    (adduser -D -u 1001 -G gxprotocol gxprotocol || true) && \
    chown -R gxprotocol:gxprotocol /app

USER gxprotocol

# Expose service port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the service
CMD ["node", "apps/svc-identity/dist/index.js"]
