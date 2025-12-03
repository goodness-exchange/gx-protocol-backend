#!/bin/bash
# GX Protocol Backend - Local Development Environment Setup Script
# Run this script to quickly set up your local development environment

set -e  # Exit on any error

echo "🚀 GX Protocol Backend - Local Development Setup"
echo "=================================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if we're in the project root
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: Must run this script from project root${NC}"
    exit 1
fi

echo "📋 Checking prerequisites..."
echo ""

# Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker not found. Please install Docker Desktop.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Docker installed${NC}"

# Check Docker Compose
if ! command -v docker compose &> /dev/null; then
    echo -e "${RED}❌ Docker Compose not found.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Docker Compose installed${NC}"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js not found. Please install Node.js 18.18.0${NC}"
    exit 1
fi
NODE_VERSION=$(node --version)
echo -e "${GREEN}✅ Node.js installed (${NODE_VERSION})${NC}"

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm not found.${NC}"
    exit 1
fi
NPM_VERSION=$(npm --version)
echo -e "${GREEN}✅ npm installed (v${NPM_VERSION})${NC}"

echo ""
echo "🔧 Setting up environment..."
echo ""

# Create .env if it doesn't exist
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}📝 Creating .env file from template...${NC}"
    cp .env.example .env
    echo -e "${GREEN}✅ .env file created${NC}"
    echo -e "${YELLOW}   Review and update .env if needed${NC}"
else
    echo -e "${GREEN}✅ .env file already exists${NC}"
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo ""
    echo -e "${YELLOW}📦 Installing npm dependencies (this may take a few minutes)...${NC}"
    npm install
    echo -e "${GREEN}✅ Dependencies installed${NC}"
else
    echo -e "${GREEN}✅ Dependencies already installed${NC}"
fi

echo ""
echo "🐳 Starting Docker services..."
echo ""

# Start Docker Compose services
docker compose -f infra/docker/docker-compose.dev.yml up -d

# Wait for services to be healthy
echo ""
echo -e "${YELLOW}⏳ Waiting for services to be ready...${NC}"
sleep 5

# Check PostgreSQL health
for i in {1..10}; do
    if docker exec gx_postgres_dev pg_isready -U gxuser &> /dev/null; then
        echo -e "${GREEN}✅ PostgreSQL is ready${NC}"
        break
    fi
    if [ $i -eq 10 ]; then
        echo -e "${RED}❌ PostgreSQL failed to start${NC}"
        docker compose -f infra/docker/docker-compose.dev.yml logs postgres
        exit 1
    fi
    sleep 2
done

# Check Redis health
if docker exec gx_redis_dev redis-cli ping &> /dev/null; then
    echo -e "${GREEN}✅ Redis is ready${NC}"
else
    echo -e "${RED}❌ Redis failed to start${NC}"
    docker compose -f infra/docker/docker-compose.dev.yml logs redis
    exit 1
fi

echo ""
echo "🗄️  Setting up database..."
echo ""

# Generate Prisma client
echo -e "${YELLOW}📝 Generating Prisma client...${NC}"
npx prisma generate --schema=./db/prisma/schema.prisma
echo -e "${GREEN}✅ Prisma client generated${NC}"

# Run migrations
echo ""
echo -e "${YELLOW}🔄 Running database migrations...${NC}"
if npx prisma migrate deploy --schema=./db/prisma/schema.prisma; then
    echo -e "${GREEN}✅ Migrations completed${NC}"
else
    echo -e "${YELLOW}⚠️  No migrations to run yet${NC}"
fi

echo ""
echo "✅ Local development environment is ready!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📊 Services Status:"
echo ""
docker compose -f infra/docker/docker-compose.dev.yml ps
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🎯 Next Steps:"
echo ""
echo "  1. Review .env file and update if needed:"
echo "     code .env"
echo ""
echo "  2. Start development server (when implemented):"
echo "     npm run dev"
echo ""
echo "  3. View logs:"
echo "     docker compose -f infra/docker/docker-compose.dev.yml logs -f"
echo ""
echo "  4. Stop services when done:"
echo "     docker compose -f infra/docker/docker-compose.dev.yml down"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📚 For more information, see docs/LOCAL-DEVELOPMENT.md"
echo ""
echo "🚀 Happy coding!"
echo ""
