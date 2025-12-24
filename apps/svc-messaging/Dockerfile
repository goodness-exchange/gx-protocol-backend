# Multi-stage Dockerfile for GX Protocol Service (Monorepo)
# Service: svc-messaging

# ============================================
# Stage 1: Dependencies
# ============================================
FROM node:18-alpine AS dependencies

WORKDIR /app

# Copy package files for dependency installation
COPY package.json package-lock.json* turbo.json ./
COPY apps/svc-messaging/package.json ./apps/svc-messaging/
COPY packages/*/package.json ./packages/

# Install all dependencies (including dev for building)
RUN npm ci --legacy-peer-deps

# ============================================
# Stage 2: Builder
# ============================================
FROM node:18-alpine AS builder

WORKDIR /app

# Copy dependencies from previous stage
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/package.json ./
COPY --from=dependencies /app/package-lock.json ./

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate --schema=./db/prisma/schema.prisma

# Build all packages and the service using turbo
RUN npx turbo run build --filter=@gx/svc-messaging...

# ============================================
# Stage 3: Production
# ============================================
FROM node:18-alpine AS production

# Set NODE_ENV
ENV NODE_ENV=production

WORKDIR /app

# Copy node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy built service
COPY --from=builder /app/apps/svc-messaging/dist ./apps/svc-messaging/dist

# Copy built workspace packages (package.json + dist for each)
COPY --from=builder /app/packages/core-config/package.json ./packages/core-config/
COPY --from=builder /app/packages/core-config/dist ./packages/core-config/dist
COPY --from=builder /app/packages/core-db/package.json ./packages/core-db/
COPY --from=builder /app/packages/core-db/dist ./packages/core-db/dist
COPY --from=builder /app/packages/core-logger/package.json ./packages/core-logger/
COPY --from=builder /app/packages/core-logger/dist ./packages/core-logger/dist
COPY --from=builder /app/packages/core-http/package.json ./packages/core-http/
COPY --from=builder /app/packages/core-http/dist ./packages/core-http/dist
COPY --from=builder /app/packages/core-events/package.json ./packages/core-events/
COPY --from=builder /app/packages/core-events/dist ./packages/core-events/dist
COPY --from=builder /app/packages/core-openapi/package.json ./packages/core-openapi/
COPY --from=builder /app/packages/core-openapi/dist ./packages/core-openapi/dist
COPY --from=builder /app/packages/core-storage/package.json ./packages/core-storage/
COPY --from=builder /app/packages/core-storage/dist ./packages/core-storage/dist

# Copy Prisma schema and generated client
COPY --from=builder /app/db/prisma ./db/prisma
COPY --from=builder /app/packages/core-db/node_modules/.prisma ./packages/core-db/node_modules/.prisma

# Replace workspace symlinks with actual directories in node_modules/@gx
RUN rm -rf /app/node_modules/@gx && mkdir -p /app/node_modules/@gx && \
    cp -r /app/packages/core-config /app/node_modules/@gx/ && \
    cp -r /app/packages/core-db /app/node_modules/@gx/ && \
    cp -r /app/packages/core-logger /app/node_modules/@gx/ && \
    cp -r /app/packages/core-http /app/node_modules/@gx/ && \
    cp -r /app/packages/core-events /app/node_modules/@gx/ && \
    cp -r /app/packages/core-openapi /app/node_modules/@gx/ && \
    cp -r /app/packages/core-storage /app/node_modules/@gx/ && \
    chmod -R a+rX /app/node_modules/@gx

# Copy Prisma client to root node_modules
RUN mkdir -p /app/node_modules/.prisma && \
    cp -r /app/packages/core-db/node_modules/.prisma/* /app/node_modules/.prisma/

# Create non-root user
RUN (addgroup -g 1001 gxprotocol || true) && \
    (adduser -D -u 1001 -G gxprotocol gxprotocol || true) && \
    chown -R gxprotocol:gxprotocol /app

USER gxprotocol

# Expose HTTP and WebSocket ports
EXPOSE 3007 3008

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3007/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the service
CMD ["node", "apps/svc-messaging/dist/index.js"]
