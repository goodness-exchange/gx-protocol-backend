# Local Development Environment Guide

**Project:** GX Coin Protocol Backend  
**Last Updated:** October 15, 2025  
**Purpose:** Guide for setting up and running the local development environment

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Services Overview](#services-overview)
4. [Environment Configuration](#environment-configuration)
5. [Starting Services](#starting-services)
6. [Stopping Services](#stopping-services)
7. [Database Operations](#database-operations)
8. [Redis Operations](#redis-operations)
9. [Running the Application](#running-the-application)
10. [Troubleshooting](#troubleshooting)
11. [Common Commands](#common-commands)
12. [Development Workflow](#development-workflow)

---

## Prerequisites

### Required Software

- ✅ **WSL2** (Windows Subsystem for Linux 2) - Installed
- ✅ **Docker Desktop** - Installed with WSL2 integration
- ✅ **Node.js 18.18.0** - Installed in WSL2 Ubuntu
- ✅ **Git** - Configured in WSL2
- ✅ **VS Code** - With WSL extension, connected to Ubuntu

### Verify Prerequisites

```bash
# Check WSL2
wsl --version
# Expected: WSL version 2.x.x

# Check Docker
docker --version
# Expected: Docker version 24.x.x

docker compose version
# Expected: Docker Compose version v2.x.x

# Check Node.js
node --version
# Expected: v18.18.0 or v18.x.x

# Check npm
npm --version
# Expected: 9.x.x or 10.x.x

# Check Git
git --version
# Expected: git version 2.x.x
```

---

## Quick Start

### 1. Clone and Setup (First Time Only)

```bash
# If not already done
cd ~/projects/gx-protocol-backend

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Review and modify .env if needed
nano .env  # or: code .env
```

### 2. Start Docker Services

```bash
# Start PostgreSQL and Redis
docker compose -f infra/docker/docker-compose.dev.yml up -d

# Verify services are running
docker compose -f infra/docker/docker-compose.dev.yml ps
```

### 3. Run Database Migrations

```bash
# Generate Prisma client
npx prisma generate --schema=./db/prisma/schema.prisma

# Run migrations
npm run migrate

# Or manually:
npx prisma migrate dev --schema=./db/prisma/schema.prisma
```

### 4. Start Development Servers (When Implemented)

```bash
# Run all services in development mode
npm run dev

# Or run specific service
npm run dev --filter=svc-identity
```

---

## Services Overview

### Docker Services

Our local development environment runs these services in Docker containers:

#### 1. PostgreSQL Database
- **Image:** postgres:15-alpine
- **Container Name:** gx_postgres_dev
- **Port:** 5432 (host) → 5432 (container)
- **Purpose:** Main database for read models, outbox, projector state
- **Credentials:**
  - User: `gxuser`
  - Password: `gxpass`
  - Database: `gxprotocol_dev`
- **Data Persistence:** Docker volume `pgdata`
- **Health Check:** pg_isready every 10s

#### 2. Redis Cache
- **Image:** redis:7-alpine
- **Container Name:** gx_redis_dev
- **Port:** 6379 (host) → 6379 (container)
- **Purpose:** Caching, session storage, pub/sub
- **Data Persistence:** Docker volume `redisdata`
- **Health Check:** redis-cli ping every 10s

### Application Services (To Be Implemented)

These will run directly in WSL2 (not in Docker containers for development):

1. **svc-identity** - User registration, KYC (Phase 1)
2. **svc-tokenomics** - Wallet, transfers (Phase 2)
3. **svc-organizations** - Organization management (Phase 3)
4. **svc-governance** - Governance operations (Phase 3)
5. **outbox-submitter** - Worker for Fabric submissions (Phase 1)
6. **projector** - Worker for event processing (Phase 1)

---

## Environment Configuration

### .env File Structure

```bash
# Database Configuration
DATABASE_URL="postgresql://gxuser:gxpass@localhost:5432/gxprotocol_dev?schema=public"
POSTGRES_USER=gxuser
POSTGRES_PASSWORD=gxpass
POSTGRES_DB=gxprotocol_dev

# Redis Configuration
REDIS_URL="redis://localhost:6379"

# API Configuration
PORT=3000
NODE_ENV="development"
LOG_LEVEL="debug"

# Security
JWT_SECRET="change-me-in-production"
JWT_EXPIRY="24h"

# Observability
PROMETHEUS_PORT=9090

# Projection Lag Threshold (milliseconds)
PROJECTION_LAG_THRESHOLD_MS=10000

# Worker Configuration
OUTBOX_POLL_INTERVAL_MS=1000
PROJECTOR_POLL_INTERVAL_MS=500

# Feature Flags
CHAINCODE_VERSION="v1"
ENABLE_IDEMPOTENCY="true"

# Fabric Network Configuration (Phase 1 - Not used yet)
FABRIC_NETWORK_PROFILE="./infra/fabric/connection-profile.json"
FABRIC_WALLET_PATH="./infra/fabric/wallet"
FABRIC_CHANNEL_NAME="gxchannel"
FABRIC_CHAINCODE_NAME="gxcoin"
```

### Environment Variables Explained

| Variable | Purpose | Default | Notes |
|----------|---------|---------|-------|
| `DATABASE_URL` | PostgreSQL connection string | localhost:5432 | Used by Prisma |
| `REDIS_URL` | Redis connection string | localhost:6379 | Used by services |
| `PORT` | API server port | 3000 | HTTP server port |
| `NODE_ENV` | Environment | development | development/production |
| `LOG_LEVEL` | Logging verbosity | debug | trace/debug/info/warn/error |
| `JWT_SECRET` | JWT signing key | change-me | **Change in production!** |
| `PROJECTION_LAG_THRESHOLD_MS` | Max acceptable lag | 10000 | For health checks |

---

## Starting Services

### Start All Docker Services

```bash
# Navigate to project root
cd ~/projects/gx-protocol-backend

# Start services in detached mode (background)
docker compose -f infra/docker/docker-compose.dev.yml up -d

# View logs
docker compose -f infra/docker/docker-compose.dev.yml logs -f

# View logs for specific service
docker compose -f infra/docker/docker-compose.dev.yml logs -f postgres
docker compose -f infra/docker/docker-compose.dev.yml logs -f redis
```

### Start Individual Services

```bash
# Start only PostgreSQL
docker compose -f infra/docker/docker-compose.dev.yml up -d postgres

# Start only Redis
docker compose -f infra/docker/docker-compose.dev.yml up -d redis
```

### Verify Services Are Running

```bash
# Check container status
docker compose -f infra/docker/docker-compose.dev.yml ps

# Expected output:
# NAME              IMAGE                COMMAND                  STATUS         PORTS
# gx_postgres_dev   postgres:15-alpine   "docker-entrypoint..."   Up (healthy)   0.0.0.0:5432->5432/tcp
# gx_redis_dev      redis:7-alpine       "docker-entrypoint..."   Up (healthy)   0.0.0.0:6379->6379/tcp

# Check container health
docker compose -f infra/docker/docker-compose.dev.yml ps --filter "health=healthy"
```

---

## Stopping Services

### Stop All Services

```bash
# Stop services (containers remain, data persists)
docker compose -f infra/docker/docker-compose.dev.yml stop

# Stop and remove containers (data still persists in volumes)
docker compose -f infra/docker/docker-compose.dev.yml down

# Stop, remove containers AND volumes (⚠️ DATA LOSS!)
docker compose -f infra/docker/docker-compose.dev.yml down -v
```

### Stop Individual Services

```bash
# Stop PostgreSQL only
docker compose -f infra/docker/docker-compose.dev.yml stop postgres

# Stop Redis only
docker compose -f infra/docker/docker-compose.dev.yml stop redis
```

### Restart Services

```bash
# Restart all services
docker compose -f infra/docker/docker-compose.dev.yml restart

# Restart specific service
docker compose -f infra/docker/docker-compose.dev.yml restart postgres
```

---

## Database Operations

### Connect to PostgreSQL

#### Using psql CLI

```bash
# Connect from host machine (requires psql installed)
psql -h localhost -p 5432 -U gxuser -d gxprotocol_dev
# Password: gxpass

# Or connect via Docker exec
docker exec -it gx_postgres_dev psql -U gxuser -d gxprotocol_dev
```

#### Using Prisma Studio (GUI)

```bash
# Launch Prisma Studio (opens in browser)
npx prisma studio --schema=./db/prisma/schema.prisma
```

### Run Migrations

```bash
# Create a new migration (after schema changes)
npx prisma migrate dev --name describe_your_changes --schema=./db/prisma/schema.prisma

# Apply pending migrations
npx prisma migrate deploy --schema=./db/prisma/schema.prisma

# Reset database (⚠️ DATA LOSS!)
npx prisma migrate reset --schema=./db/prisma/schema.prisma
```

### Seed Database

```bash
# Run seed script (when implemented)
npm run db:seed

# Or manually
npx prisma db seed
```

### Backup and Restore

```bash
# Backup database
docker exec gx_postgres_dev pg_dump -U gxuser gxprotocol_dev > backup.sql

# Restore database
cat backup.sql | docker exec -i gx_postgres_dev psql -U gxuser -d gxprotocol_dev
```

### Common SQL Queries

```sql
-- List all tables
\dt

-- Describe table structure
\d table_name

-- Check database size
SELECT pg_size_pretty(pg_database_size('gxprotocol_dev'));

-- List all users
\du

-- Check active connections
SELECT * FROM pg_stat_activity;

-- Exit psql
\q
```

---

## Redis Operations

### Connect to Redis

```bash
# Connect via redis-cli
docker exec -it gx_redis_dev redis-cli

# Or from host (requires redis-cli installed)
redis-cli -h localhost -p 6379
```

### Common Redis Commands

```bash
# In redis-cli:

# Ping server
PING
# Expected: PONG

# Set a key
SET mykey "Hello World"

# Get a key
GET mykey

# List all keys
KEYS *

# Delete a key
DEL mykey

# Flush all data (⚠️ DATA LOSS!)
FLUSHALL

# Get server info
INFO

# Monitor all commands in real-time
MONITOR

# Exit redis-cli
EXIT
```

### Redis GUI Tools (Optional)

**RedisInsight** (Recommended):
1. Download: https://redis.com/redis-enterprise/redis-insight/
2. Install and launch
3. Connect to: `localhost:6379`

**Redis Commander** (Web-based):
```bash
# Run via Docker
docker run -d \
  --name redis-commander \
  -p 8081:8081 \
  -e REDIS_HOSTS=local:host.docker.internal:6379 \
  rediscommander/redis-commander
```
Access at: http://localhost:8081

---

## Running the Application

### Development Mode (Hot Reload)

```bash
# Run all services (when implemented)
npm run dev

# Run specific service
npm run dev --filter=svc-identity
npm run dev --filter=svc-tokenomics

# Run worker
npm run dev --filter=outbox-submitter
npm run dev --filter=projector
```

### Build Mode

```bash
# Build all packages
npm run build

# Build specific package
npm run build --filter=@gx/core-db

# Type check
npm run type-check

# Lint
npm run lint
```

### Test Mode

```bash
# Run all tests (when implemented)
npm test

# Run specific test
npm test -- svc-identity

# Run with coverage
npm run test:coverage
```

---

## Troubleshooting

### Issue 1: "Port 5432 already in use"

**Problem:** PostgreSQL is already running on Windows or another service is using port 5432.

**Solution:**
```powershell
# In Windows PowerShell (Admin):
# Stop Windows PostgreSQL service
Stop-Service postgresql-x64-*

# Or check what's using port 5432
netstat -ano | findstr :5432

# Or change port in docker-compose.dev.yml to 5433:5432
```

---

### Issue 2: "Port 6379 already in use"

**Problem:** Redis is already running on Windows.

**Solution:**
```bash
# Change port in docker-compose.dev.yml to 6380:6379
# Then update .env:
REDIS_URL="redis://localhost:6380"
```

---

### Issue 3: "Cannot connect to Docker daemon"

**Problem:** Docker Desktop is not running.

**Solution:**
1. Start Docker Desktop from Windows Start Menu
2. Wait for it to fully start (green icon in system tray)
3. Verify: `docker ps` should work

---

### Issue 4: "Permission denied" errors

**Problem:** File permission issues in WSL2.

**Solution:**
```bash
# Fix ownership
sudo chown -R $USER:$USER ~/projects/gx-protocol-backend

# Fix npm permissions
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

---

### Issue 5: Database migrations fail

**Problem:** Database state is inconsistent.

**Solution:**
```bash
# Reset database (⚠️ DATA LOSS!)
npx prisma migrate reset --schema=./db/prisma/schema.prisma

# Or drop and recreate
docker compose -f infra/docker/docker-compose.dev.yml down -v
docker compose -f infra/docker/docker-compose.dev.yml up -d
npm run migrate
```

---

### Issue 6: Slow performance

**Problem:** Project files are on Windows file system (`/mnt/c/`).

**Solution:**
```bash
# Ensure project is in WSL2 file system
pwd
# Should be: /home/[user]/projects/gx-protocol-backend
# NOT: /mnt/c/Users/...

# If in wrong location, re-clone:
cd ~/projects
git clone https://github.com/goodness-exchange/gx-protocol-backend.git
```

---

### Issue 7: "ECONNREFUSED" when connecting to database

**Problem:** Database container is not ready.

**Solution:**
```bash
# Check container health
docker compose -f infra/docker/docker-compose.dev.yml ps

# View logs
docker compose -f infra/docker/docker-compose.dev.yml logs postgres

# Wait for health check to pass (up to 50 seconds)
# Or restart container
docker compose -f infra/docker/docker-compose.dev.yml restart postgres
```

---

## Common Commands

### Docker Compose Shortcuts

```bash
# Create alias for easier typing (add to ~/.bashrc)
alias dc='docker compose -f infra/docker/docker-compose.dev.yml'

# Then you can use:
dc up -d
dc down
dc ps
dc logs -f
dc restart postgres
```

### Project Commands

```bash
# Install dependencies
npm install

# Type check
npm run type-check

# Lint
npm run lint

# Format code
npm run format

# Build all
npm run build

# Clean build artifacts
npm run clean

# Run tests (when implemented)
npm test
```

### Database Commands

```bash
# Generate Prisma client
npx prisma generate --schema=./db/prisma/schema.prisma

# Run migrations
npm run migrate

# Reset database
npx prisma migrate reset --schema=./db/prisma/schema.prisma

# Open Prisma Studio
npx prisma studio --schema=./db/prisma/schema.prisma

# Create migration
npx prisma migrate dev --name migration_name --schema=./db/prisma/schema.prisma
```

### Container Management

```bash
# View all containers
docker ps -a

# View logs
docker logs gx_postgres_dev
docker logs gx_redis_dev

# Execute command in container
docker exec -it gx_postgres_dev bash
docker exec -it gx_redis_dev sh

# Remove all stopped containers
docker container prune

# Remove all unused volumes
docker volume prune
```

---

## Development Workflow

### Daily Workflow

**Morning:**
```bash
# 1. Start Docker Desktop (if not already running)

# 2. Open VS Code and connect to WSL
code ~/projects/gx-protocol-backend

# 3. Start Docker services
docker compose -f infra/docker/docker-compose.dev.yml up -d

# 4. Pull latest changes
git pull origin dev

# 5. Install any new dependencies
npm install

# 6. Run migrations if schema changed
npm run migrate

# 7. Start development server (when implemented)
npm run dev
```

**During Development:**
```bash
# Make code changes in VS Code

# Type check
npm run type-check

# Lint
npm run lint

# Test specific feature
npm test -- path/to/test

# View logs
docker compose -f infra/docker/docker-compose.dev.yml logs -f
```

**End of Day:**
```bash
# Commit changes
git add .
git commit -m "feat: description of changes"
git push origin dev

# Stop services (optional - can leave running)
docker compose -f infra/docker/docker-compose.dev.yml stop
```

### Feature Development Workflow

1. **Create feature branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make changes and test:**
   ```bash
   # Edit code
   npm run type-check
   npm run lint
   npm test
   ```

3. **Commit and push:**
   ```bash
   git add .
   git commit -m "feat: your feature description"
   git push origin feature/your-feature-name
   ```

4. **Create Pull Request:**
   - Go to GitHub
   - Create PR from feature branch to dev
   - CI/CD will run automatically

5. **Merge when approved:**
   ```bash
   git checkout dev
   git pull origin dev
   git branch -d feature/your-feature-name
   ```

---

## Performance Tips

### 1. Keep Docker Containers Running

Don't stop containers between work sessions - they start much faster when already running.

### 2. Use WSL2 File System

**Always** keep project files in WSL2 (`~/projects/`), not Windows (`/mnt/c/`).

**Performance difference:** 10x-50x faster!

### 3. Disable Unnecessary Services

If you're only working on backend code, you don't need PgAdmin or other GUI tools running.

### 4. Use Docker BuildKit

```bash
# Add to ~/.bashrc
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1
```

### 5. Increase Docker Resources

In Docker Desktop:
- Settings → Resources
- Increase CPU cores to 4
- Increase Memory to 8GB (if available)

---

## Next Steps

### Phase 1 (Weeks 3-6)

When we implement services, you'll:

1. **Start services:**
   ```bash
   npm run dev --filter=svc-identity
   ```

2. **Test APIs:**
   ```bash
   curl http://localhost:3000/api/v1/health
   ```

3. **Connect to Fabric:**
   - Connect external AlmaLinux HDD
   - Update `.env` with Fabric connection details
   - Test chaincode interactions

### Future Enhancements

- Add PgAdmin for database GUI
- Add Prometheus + Grafana for monitoring
- Add Jaeger for distributed tracing
- Add load testing with k6

---

## Resources

### Documentation
- **Docker Compose:** https://docs.docker.com/compose/
- **PostgreSQL:** https://www.postgresql.org/docs/
- **Redis:** https://redis.io/documentation
- **Prisma:** https://www.prisma.io/docs

### Tools
- **Prisma Studio:** Built-in database GUI
- **RedisInsight:** Redis GUI
- **PgAdmin:** PostgreSQL GUI (optional)
- **TablePlus:** Multi-database GUI (optional)

---

## Summary

**Your local development environment consists of:**

✅ **PostgreSQL** - Main database (port 5432)  
✅ **Redis** - Caching and pub/sub (port 6379)  
✅ **WSL2 Ubuntu** - Development runtime  
✅ **Node.js 18.18.0** - Application runtime  
✅ **Docker Desktop** - Container orchestration  
✅ **VS Code** - Code editor with WSL integration

**Services are configured, tested, and ready to use!**

---

**Document Version:** 1.0  
**Last Updated:** October 15, 2025  
**Maintainer:** Development Team  
**Status:** Complete and ready for Phase 1
