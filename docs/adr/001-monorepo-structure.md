# ADR-001: Monorepo Structure with Turborepo

## Status
Accepted

## Date
2025-10-14

## Context
We need to organize the GX Coin Protocol backend as a collection of microservices, workers, and shared packages that can be developed, tested, and deployed independently while maintaining code consistency and shared utilities.

## Decision
We will use a monorepo structure powered by:
- **Turborepo** for task orchestration and caching
- **NPM Workspaces** for dependency management
- **TypeScript** with a shared base configuration

### Directory Structure
```
gx-backend/
├── apps/          # HTTP microservices
├── workers/       # Background processes
├── packages/      # Shared libraries
```

### Key Packages
- `core-config`: Environment variable management
- `core-logger`: Structured logging (Pino)
- `core-http`: HTTP middlewares
- `core-db`: Prisma client and database utilities
- `core-fabric`: Hyperledger Fabric SDK wrapper
- `core-events`: Event schema registry

## Consequences

### Positive
- Single repository simplifies dependency management
- Shared tooling (TypeScript, ESLint, Prettier) across all packages
- Turborepo provides intelligent caching and parallel execution
- Easy to refactor and share code between services
- Atomic commits across multiple packages

### Negative
- Initial setup complexity
- Requires discipline to maintain boundaries
- CI/CD needs to be smart about which services to deploy
- Larger git repository size over time

## Alternatives Considered
1. **Polyrepo**: Rejected due to complexity in managing shared dependencies
2. **Lerna**: Rejected in favor of Turborepo's superior caching
3. **Nx**: Rejected due to steeper learning curve

## References
- [Turborepo Documentation](https://turbo.build/)
- [NPM Workspaces](https://docs.npmjs.com/cli/v10/using-npm/workspaces)
