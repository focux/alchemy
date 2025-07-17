# Coolify Provider

This provider enables Infrastructure-as-Code management of Coolify resources using Alchemy.

## Resources

### Core Infrastructure
- **PrivateKey** - SSH keys for server access and Git authentication
- **Server** - Physical or virtual machines hosting Coolify workloads
- **Team** - Multi-tenancy organizational units

### Organization
- **Project** - Top-level containers for organizing resources
- **Environment** - Deployment contexts within projects (auto-created)

### Workloads
- **Application** - Web applications, APIs, and static sites
- **Database** - Managed database instances (PostgreSQL, MySQL, Redis, etc.)
- **Service** - Docker Compose based services
- **Deployment** - Application deployment records

## Resource Hierarchy

```
Team
 ├── PrivateKey
 └── Project
      └── Environment
           ├── Application → Server
           ├── Database → Server
           └── Service → Server
```

## API Client

Each resource file exports API functions following this pattern:

```typescript
export interface ListResourcesRequest { ... }
export interface ListResourcesResponse { ... }
export function listResources(api: CoolifyClient, req: ListResourcesRequest): Promise<ListResourcesResponse>
```

## Implementation Status

- [x] API Client (`client.ts`)
- [x] PrivateKey (`private-key.ts`)
- [x] Server (`server.ts`)
- [x] Team (`team.ts`)
- [x] Project (`project.ts`)
- [ ] Application (`application.ts`)
- [ ] Database (`database.ts`)
- [ ] Service (`service.ts`)
- [ ] Deployment (`deployment.ts`)

## Design Documentation

See [design.md](./design.md) for detailed API documentation and lifecycle procedures.