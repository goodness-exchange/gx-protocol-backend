# ADR-002: CQRS Pattern with Outbox and Projector

## Status
Accepted

## Date
2025-10-14

## Context
We need a reliable way to interact with Hyperledger Fabric while maintaining fast read performance for the API layer. Direct chaincode invocations are slow and can fail, impacting user experience.

## Decision
We will implement the **CQRS (Command Query Responsibility Segregation)** pattern with the **Outbox Pattern** for writes and a **Projector** for reads.

### Write Path (Commands)
```
API → outbox_commands table → outbox-submitter worker → Fabric chaincode
```

1. API endpoints write commands to `outbox_commands` table
2. HTTP request returns immediately (fast response)
3. `outbox-submitter` worker polls the outbox and submits to Fabric
4. Worker updates outbox status (SUCCESS/FAILED)

### Read Path (Queries)
```
Fabric Event → projector worker → Read Model tables → API
```

1. `projector` worker listens to Fabric events
2. Events are validated against JSON schemas
3. Projector updates read model tables (e.g., `user_profiles`, `wallets`)
4. API queries read models directly (fast reads)

### Key Tables
- `outbox_commands`: Pending writes to Fabric
- `projector_state`: Event processing checkpoint
- Read models: Domain-specific tables (users, wallets, transactions)

## Consequences

### Positive
- **Reliability**: Outbox ensures no commands are lost
- **Performance**: API reads from PostgreSQL, not Fabric
- **Scalability**: Workers can be scaled independently
- **Consistency**: Eventually consistent, but predictable
- **Observability**: `projection_lag_ms` metric tracks lag

### Negative
- **Complexity**: More moving parts (workers, tables)
- **Eventual Consistency**: Reads may lag behind writes
- **Operational Overhead**: Need to monitor projection lag

## Mitigation
- `/readyz` endpoint fails if projection lag > threshold
- Dead-Letter Queue (DLQ) for failed events
- Alerting on projection lag and outbox queue size

## References
- [CQRS Pattern](https://martinfowler.com/bliki/CQRS.html)
- [Outbox Pattern](https://microservices.io/patterns/data/transactional-outbox.html)
