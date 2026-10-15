---
name: service-operations
description: Operate, deploy, diagnose, and roll back a software service when production work is requested.
license: Apache-2.0
---

# Service operations

Use the least disruptive operation that can satisfy the request.

## Safety

Confirm the target environment and preserve an auditable record.

## Deployment

Build an immutable artifact, deploy it gradually, and verify health before completing.

### Rollback

Roll back automatically if the declared health checks fail.

## Diagnosis

Inspect health, recent changes, metrics, and logs before proposing a fix.

## Reporting

Report the target, outcome, verification, and any follow-up work.

