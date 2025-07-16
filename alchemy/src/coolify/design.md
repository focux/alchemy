# Coolify Provider Design

This document outlines the design for the Coolify Infrastructure-as-Code provider for Alchemy. Coolify is a self-hosted platform that provides an alternative to services like Heroku, Vercel, and Netlify.

## Overview

The Coolify provider enables Infrastructure-as-Code management of:
- Servers (compute resources)
- Private Keys (SSH and Git authentication)
- Teams (multi-tenancy)
- Projects (organizational units)
- Environments (deployment contexts within projects)
- Applications (web apps, APIs, static sites)
- Databases (PostgreSQL, MySQL, Redis, MongoDB, etc.)
- Services (Docker Compose based deployments)
- Deployments (application deployment history)

## API Configuration

- **Base URL**: `http://<coolify-instance>:8000/api/v1`
- **Authentication**: Bearer token (created in Coolify UI under "Keys & Tokens")
- **Docs**: [Authorization](https://coolify.io/docs/api-reference/authorization)

## Resource Topology

```mermaid
graph TD
    Team[Team]
    Team -->|owns| PrivateKey[PrivateKey]
    Team -->|owns| Project[Project]
    
    Project -->|contains| Environment[Environment]
    
    Environment -->|hosts| Application[Application]
    Environment -->|hosts| Database[Database]
    Environment -->|hosts| Service[Service]
    
    Application -->|deployed to| Server1[Server]
    Application -.->|uses| PrivateKey
    
    Database -->|deployed to| Server2[Server]
    Service -->|deployed to| Server3[Server]
    
    Server1 -->|authenticated via| PrivateKey2[PrivateKey]
    Server2 -->|authenticated via| PrivateKey3[PrivateKey]
    Server3 -->|authenticated via| PrivateKey4[PrivateKey]
    
    Application -->|creates| Deployment[Deployment]
    
    style Team fill:#f9f,stroke:#333,stroke-width:4px
    style Project fill:#bbf,stroke:#333,stroke-width:2px
    style Environment fill:#bfb,stroke:#333,stroke-width:2px
    style Server1 fill:#fbb,stroke:#333,stroke-width:2px
    style Server2 fill:#fbb,stroke:#333,stroke-width:2px
    style Server3 fill:#fbb,stroke:#333,stroke-width:2px
```

## Resources

### 1. PrivateKey

**Description**: SSH keys used for server access and private Git repository authentication.

**Properties**:
- `name` (string, required): Key name
- `privateKey` (string, required): Private key content
- `description` (string, optional): Key description
- `adopt` (boolean, optional, default: false): Adopt existing resource if found

**Outputs**:
- `privateKeyId` (string): UUID of the private key
- `publicKey` (string): Derived public key
- `fingerprint` (string): SSH fingerprint

**Usage Example**:
```typescript
import { PrivateKey } from "@alchemy/coolify";

// Create a new private key
const deployKey = await PrivateKey("github-deploy-key", {
  name: "GitHub Deploy Key",
  privateKey: process.env.GITHUB_PRIVATE_KEY!,
  description: "SSH key for private GitHub repositories",
});

// Adopt an existing private key
const existingKey = await PrivateKey("server-ssh-key", {
  name: "Production Server Key",
  privateKey: readFileSync("~/.ssh/id_rsa", "utf-8"),
  adopt: true, // Will find and adopt if exists
});

// Access outputs
console.log(deployKey.privateKeyId); // UUID
console.log(deployKey.publicKey); // Generated public key
console.log(deployKey.fingerprint); // SSH fingerprint
```

**API Endpoints**:
| Method | Endpoint | Description | Docs |
|--------|----------|-------------|------|
| GET | `/security/keys` | List all private keys | [Link](https://coolify.io/docs/api-reference/api/operations/list-private-keys) |
| POST | `/security/keys` | Create a new private key | [Link](https://coolify.io/docs/api-reference/api/operations/create-private-key) |
| GET | `/security/keys/{uuid}` | Get private key by UUID | [Link](https://coolify.io/docs/api-reference/api/operations/get-private-key-by-uuid) |
| PATCH | `/security/keys/{uuid}` | Update private key | [Link](https://coolify.io/docs/api-reference/api/operations/update-private-key-by-uuid) |
| DELETE | `/security/keys/{uuid}` | Delete private key | [Link](https://coolify.io/docs/api-reference/api/operations/delete-private-key-by-uuid) |

**Lifecycle**:

**Create**:
1. Validate private key format (must be valid SSH private key)
2. Extract public key from private key using SSH key parsing
3. Calculate SSH fingerprint
4. If `adopt` is true:
   - Call `GET /security/keys` to list all existing keys
   - Search for a key with matching name or fingerprint
   - If found:
     - Verify the private key content matches (by comparing fingerprints)
     - If content differs, fail with error (cannot adopt with different key content)
     - Store the existing key's UUID
     - Proceed to update phase with any changed properties (name, description)
     - Return the adopted key details
   - If not found, proceed with normal creation
5. Call `POST /security/keys` with:
   ```json
   {
     "name": "key-name",
     "private_key": "-----BEGIN RSA PRIVATE KEY-----...",
     "description": "optional description"
   }
   ```
6. Store returned UUID for resource reference
7. Return key details with generated public key and fingerprint

**Update**:
1. Private key content is immutable - any change to the key requires replacement
2. Only `name` and `description` can be updated
3. Call `PATCH /security/keys/{uuid}` with allowed fields:
   ```json
   {
     "name": "new-name",
     "description": "new description"
   }
   ```
4. Return updated key details

**Delete**:
1. Check if key is referenced by any servers or applications
   - Query all servers to check `private_key_uuid` references
   - Query all applications to check deploy key references
2. If referenced, fail with error listing dependent resources
3. Call `DELETE /security/keys/{uuid}`
4. Verify deletion by attempting to fetch the key (should return 404)

**Replace Required When**:
- Private key content changes (immutable field)

### 2. Server

**Description**: Represents a physical or virtual machine that hosts Coolify workloads.

**Properties**:
- `name` (string, required): Server display name
- `ip` (string, required): IP address or hostname
- `port` (number, required, default: 22): SSH port
- `user` (string, required, default: "root"): SSH user
- `privateKey` (string | PrivateKey, required): SSH private key reference
- `description` (string, optional): Server description
- `isBuildServer` (boolean, optional): Whether this server can be used for builds
- `instantValidate` (boolean, optional, default: true): Validate server on creation
- `proxyType` (string, optional): Proxy type (traefik, caddy, nginx)
- `adopt` (boolean, optional, default: false): Adopt existing resource if found

**Outputs**:
- `serverId` (string): UUID of the server
- `serverName` (string): Display name
- `validated` (boolean): Whether server connection is validated
- `proxyStatus` (string): Proxy status

**Usage Example**:
```typescript
import { Server, PrivateKey } from "@alchemy/coolify";

// First create or reference a private key
const sshKey = await PrivateKey("prod-ssh-key", {
  name: "Production SSH Key",
  privateKey: process.env.SSH_PRIVATE_KEY!,
});

// Create a new server with the private key reference
const prodServer = await Server("prod-server-1", {
  name: "production-server-1",
  ip: "192.168.1.100",
  port: 22,
  user: "root",
  privateKey: sshKey, // Pass the PrivateKey resource
  description: "Main production server",
  isBuildServer: true,
  proxyType: "traefik",
});

// Alternative: reference private key by UUID string
const stagingServer = await Server("staging-server", {
  name: "staging-server",
  ip: "10.0.0.50",
  privateKey: "existing-key-uuid", // Direct UUID reference
  adopt: true, // Adopt if server already exists
});

// Access outputs
console.log(prodServer.serverId); // UUID
console.log(prodServer.validated); // true/false
```

**API Endpoints**:
| Method | Endpoint | Description | Docs |
|--------|----------|-------------|------|
| GET | `/servers` | List all servers | [Link](https://coolify.io/docs/api-reference/api/operations/list-servers) |
| POST | `/servers` | Create a new server | [Link](https://coolify.io/docs/api-reference/api/operations/create-server) |
| GET | `/servers/{uuid}` | Get server by UUID | [Link](https://coolify.io/docs/api-reference/api/operations/get-server-by-uuid) |
| PATCH | `/servers/{uuid}` | Update server | [Link](https://coolify.io/docs/api-reference/api/operations/update-server-by-uuid) |
| DELETE | `/servers/{uuid}` | Delete server | [Link](https://coolify.io/docs/api-reference/api/operations/delete-server-by-uuid) |
| GET | `/servers/{uuid}/validate` | Validate server connection | [Link](https://coolify.io/docs/api-reference/api/operations/validate-server-by-uuid) |
| GET | `/servers/{uuid}/resources` | Get server resources | [Link](https://coolify.io/docs/api-reference/api/operations/get-resources-by-server-uuid) |
| GET | `/servers/{uuid}/domains` | Get server domains | [Link](https://coolify.io/docs/api-reference/api/operations/get-domains-by-server-uuid) |

**Lifecycle**:

**Create**:
1. Validate input parameters (name, IP, port, user)
2. Ensure referenced PrivateKey exists by fetching it
3. If `adopt` is true:
   - Call `GET /servers` to list all existing servers
   - Search for a server with matching IP:port combination
   - If found:
     - Verify connectivity parameters match (IP, port, user)
     - If parameters differ significantly, fail with error
     - Store the existing server's UUID
     - Proceed to update phase with any changed properties (name, description, privateKey, isBuildServer, proxyType)
     - If privateKey changed, trigger re-validation
     - Return the adopted server details
   - If not found, proceed with normal creation
4. Call `POST /servers` with configuration:
   ```json
   {
     "name": "production-server",
     "ip": "192.168.1.100",
     "port": 22,
     "user": "root",
     "private_key_uuid": "private-key-uuid",
     "description": "Production server",
     "is_build_server": false,
     "instant_validate": true,
     "proxy_type": "traefik"
   }
   ```
5. If `instant_validate` is true, server validation happens automatically
6. Poll validation status until complete (if validating)
7. Return server details with validated status

**Update**:
1. Fetch current server configuration using `GET /servers/{uuid}`
2. Check for immutable field changes:
   - `ip` cannot be changed
   - `port` cannot be changed
3. If private key changed, server will need re-validation
4. Call `PATCH /servers/{uuid}` with updated fields:
   ```json
   {
     "name": "new-name",
     "description": "new description",
     "private_key_uuid": "new-key-uuid",
     "is_build_server": true
   }
   ```
5. If critical fields changed, trigger re-validation
6. Return updated server details

**Delete**:
1. Call `GET /servers/{uuid}/resources` to check for active resources
2. If resources exist (applications, databases, services), fail with error:
   - List all dependent resources with their names and types
3. Call `DELETE /servers/{uuid}`
4. Verify deletion succeeded by checking for 404 on GET

**Replace Required When**:
- IP address changes
- Port changes

### 3. Team

**Description**: Organizational unit for multi-tenancy and access control.

**Properties**:
- `name` (string, required): Team name
- `description` (string, optional): Team description
- `customServerLimit` (number, optional): Custom server limit for the team
- `adopt` (boolean, optional, default: false): Adopt existing resource if found

**Outputs**:
- `teamId` (string): UUID of the team
- `teamName` (string): Display name
- `currentTeam` (boolean): Whether this is the current active team

**Usage Example**:
```typescript
import { Team } from "@alchemy/coolify";

// Adopt an existing team (teams are usually pre-created)
const devTeam = await Team("development-team", {
  name: "Development Team",
  description: "Team for development environment",
  customServerLimit: 5,
  adopt: true, // Teams are typically pre-existing
});

// Access outputs
console.log(devTeam.teamId); // UUID
console.log(devTeam.currentTeam); // true if this is the active team
```

**API Endpoints**:
| Method | Endpoint | Description | Docs |
|--------|----------|-------------|------|
| GET | `/teams` | List all teams | [Link](https://coolify.io/docs/api-reference/api/operations/list-teams) |
| GET | `/teams/current` | Get current team | [Link](https://coolify.io/docs/api-reference/api/operations/get-current-team) |
| GET | `/teams/{id}/members` | Get team members | [Link](https://coolify.io/docs/api-reference/api/operations/list-members-by-team-id) |

**Lifecycle**:

**Create**:
1. Note: Team creation is typically not available via API (managed through UI/admin)
2. Teams are usually pre-created during Coolify setup
3. If `adopt` is true:
   - Call `GET /teams` to list all existing teams
   - Search for a team with matching name
   - If found:
     - Store the existing team's UUID
     - Proceed to update phase with any changed properties (description, customServerLimit)
     - Return the adopted team details
   - If not found and API doesn't support creation, fail with appropriate error
4. If API supports creation in future:
   ```json
   {
     "name": "development-team",
     "description": "Development team",
     "custom_server_limit": 10
   }
   ```

**Update**:
1. Note: Team updates are typically restricted to admin operations
2. If supported, would update name, description, or limits
3. Call `PATCH /teams/{uuid}` with allowed fields

**Delete**:
1. Check if team has any projects using list projects API
2. If projects exist, fail with error listing them
3. Team deletion typically requires admin privileges
4. If allowed, call `DELETE /teams/{uuid}`

**Replace Required When**:
- Never (all fields that can be changed are updateable)

### 4. Project

**Description**: Top-level container for organizing related resources.

**Properties**:
- `name` (string, required): Project name
- `description` (string, optional): Project description
- `team` (string | Team, optional): Team reference (defaults to current team)
- `adopt` (boolean, optional, default: false): Adopt existing resource if found

**Outputs**:
- `projectId` (string): UUID of the project
- `projectName` (string): Display name
- `environments` (string[]): List of environment names

**Usage Example**:
```typescript
import { Project, Team } from "@alchemy/coolify";

// Reference or create a team
const team = await Team("dev-team", {
  name: "Development Team",
  adopt: true,
});

// Create a project within the team
const webProject = await Project("web-app-project", {
  name: "web-application",
  description: "Main web application project",
  team: team, // Pass Team resource
});

// Create project in current/default team
const apiProject = await Project("api-project", {
  name: "api-services",
  description: "API services project",
  // team is optional, defaults to current team
});

// Access outputs
console.log(webProject.projectId); // UUID
console.log(webProject.environments); // ["production"] - default env
```

**API Endpoints**:
| Method | Endpoint | Description | Docs |
|--------|----------|-------------|------|
| GET | `/projects` | List all projects | [Link](https://coolify.io/docs/api-reference/api/operations/list-projects) |
| POST | `/projects` | Create a new project | [Link](https://coolify.io/docs/api-reference/api/operations/create-project) |
| GET | `/projects/{uuid}` | Get project by UUID | [Link](https://coolify.io/docs/api-reference/api/operations/get-project-by-uuid) |
| PATCH | `/projects/{uuid}` | Update project | [Link](https://coolify.io/docs/api-reference/api/operations/update-project-by-uuid) |
| DELETE | `/projects/{uuid}` | Delete project | [Link](https://coolify.io/docs/api-reference/api/operations/delete-project-by-uuid) |
| GET | `/projects/{uuid}/environment/{name}` | Get project environment | [Link](https://coolify.io/docs/api-reference/api/operations/get-environment-by-project-uuid-and-name) |

**Lifecycle**:

**Create**:
1. If team not specified, get current team using `GET /teams/current`
2. If `adopt` is true:
   - Call `GET /projects` to list all existing projects
   - Search for a project with matching name within the same team
   - If found:
     - Store the existing project's UUID
     - Proceed to update phase with any changed properties (description)
     - Return the adopted project details with its environments
   - If not found, proceed with normal creation
3. Validate project name uniqueness within team
4. Call `POST /projects` with configuration:
   ```json
   {
     "name": "my-project",
     "description": "My project description"
   }
   ```
5. Coolify automatically creates a default "production" environment
6. Return project details with environment list

**Update**:
1. Fetch current project configuration using `GET /projects/{uuid}`
2. Team association cannot be changed after creation
3. Call `PATCH /projects/{uuid}` with allowed updates:
   ```json
   {
     "name": "updated-name",
     "description": "updated description"
   }
   ```
4. Return updated project details

**Delete**:
1. List all environments in the project
2. For each environment, check for resources:
   - Query applications in environment
   - Query databases in environment  
   - Query services in environment
3. If any resources exist, fail with detailed error
4. Call `DELETE /projects/{uuid}`
5. Verify deletion succeeded

**Replace Required When**:
- Team changes (not supported - must recreate)

### 5. Environment

**Description**: Deployment contexts within a project (e.g., dev, staging, production).

**Properties**:
- `name` (string, required): Environment name
- `project` (string | Project, required): Parent project reference

**Outputs**:
- `environmentName` (string): Environment name
- `projectId` (string): Parent project UUID

**Usage Example**:
```typescript
// Note: Environments are automatically created when deploying resources
// They don't have a direct resource constructor
// When creating apps/databases/services, specify the environment name:

const app = await Application("my-app", {
  name: "frontend",
  environment: "staging", // This creates the environment if needed
  // ... other props
});
```

**Note**: Environments are embedded within projects and don't have separate CRUD endpoints. They are managed through project operations.

**Lifecycle**:

**Create**:
1. Environments are automatically created when creating resources
2. When deploying an application/database/service, specify environment name
3. If environment doesn't exist, it's created automatically

**Update**:
1. Environment names are immutable
2. No direct update operation available

**Delete**:
1. Environments are automatically deleted when empty
2. Must remove all resources from environment first

**Replace Required When**:
- Not applicable (managed through parent project)

### 6. Application

**Description**: Deployed web applications, APIs, or static sites.

**Properties**:
- `name` (string, required): Application name
- `description` (string, optional): Application description
- `server` (string | Server, required): Target server
- `project` (string | Project, required): Parent project
- `environment` (string, required): Target environment name
- `type` (string, required): Application type (public, private-gh, private-deploy-key, dockerfile, docker-image, docker-compose)
- `gitRepository` (string, conditional): Git repository URL (for git-based types)
- `gitBranch` (string, optional): Git branch to deploy
- `gitCommitSha` (string, optional): Specific commit to deploy
- `privateKey` (string | PrivateKey, conditional): For private repositories
- `githubAppId` (string, conditional): For GitHub App authentication
- `dockerfile` (string, conditional): Path to Dockerfile or content
- `dockerImage` (string, conditional): Pre-built Docker image
- `dockerComposeRaw` (string, conditional): Raw docker-compose content
- `buildPack` (string, optional): Build pack type (nixpacks, dockerfile, etc.)
- `installCommand` (string, optional): Custom install command
- `buildCommand` (string, optional): Custom build command
- `startCommand` (string, optional): Custom start command
- `ports` (object, optional): Port mappings
- `environmentVariables` (Record<string, string>, optional): Environment variables
- `secrets` (Record<string, string>, optional): Secret environment variables
- `domains` (string[], optional): Custom domains
- `adopt` (boolean, optional, default: false): Adopt existing resource if found

**Outputs**:
- `applicationId` (string): UUID of the application
- `applicationName` (string): Display name
- `fqdn` (string): Fully qualified domain name
- `status` (string): Current status (running, stopped, etc.)
- `gitRepository` (string): Git repository URL
- `gitBranch` (string): Git branch

**Usage Example**:
```typescript
import { Application, Server, Project, PrivateKey } from "@alchemy/coolify";

// Dependencies
const server = await Server("web-server", { /* ... */ });
const project = await Project("my-project", { /* ... */ });
const deployKey = await PrivateKey("deploy-key", { /* ... */ });

// Public Git repository application
const publicApp = await Application("frontend-app", {
  name: "react-frontend",
  description: "React frontend application",
  server: server,
  project: project,
  environment: "production",
  type: "public",
  gitRepository: "https://github.com/myorg/frontend",
  gitBranch: "main",
  buildPack: "nixpacks",
  buildCommand: "npm run build",
  startCommand: "npm start",
  ports: { "3000": 3000 },
  domains: ["app.example.com", "www.example.com"],
  environmentVariables: {
    NODE_ENV: "production",
    API_URL: "https://api.example.com",
  },
});

// Private repository with deploy key
const privateApp = await Application("backend-api", {
  name: "nodejs-api",
  server: server,
  project: project,
  environment: "staging",
  type: "private-deploy-key",
  gitRepository: "git@github.com:myorg/backend.git",
  gitBranch: "develop",
  privateKey: deployKey, // Reference to PrivateKey resource
  installCommand: "npm ci",
  buildCommand: "npm run build",
  startCommand: "node dist/server.js",
  ports: { "8080": 8080 },
  secrets: {
    DATABASE_URL: process.env.DATABASE_URL!,
    JWT_SECRET: process.env.JWT_SECRET!,
  },
});

// Docker image application
const dockerApp = await Application("redis-cache", {
  name: "redis",
  server: server,
  project: project,
  environment: "production",
  type: "docker-image",
  dockerImage: "redis:7-alpine",
  ports: { "6379": 6379 },
});

// Access outputs
console.log(publicApp.fqdn); // Generated domain
console.log(publicApp.status); // "running"
```

**API Endpoints**:
| Method | Endpoint | Description | Docs |
|--------|----------|-------------|------|
| GET | `/applications` | List all applications | [Link](https://coolify.io/docs/api-reference/api/operations/list-applications) |
| POST | `/applications` | Create public repository app | [Link](https://coolify.io/docs/api-reference/api/operations/create-public-application) |
| POST | `/applications` | Create private GitHub app | [Link](https://coolify.io/docs/api-reference/api/operations/create-private-github-app-application) |
| POST | `/applications` | Create private deploy key app | [Link](https://coolify.io/docs/api-reference/api/operations/create-private-deploy-key-application) |
| POST | `/applications` | Create Dockerfile app | [Link](https://coolify.io/docs/api-reference/api/operations/create-dockerfile-application) |
| POST | `/applications` | Create Docker image app | [Link](https://coolify.io/docs/api-reference/api/operations/create-dockerimage-application) |
| POST | `/applications` | Create Docker Compose app | [Link](https://coolify.io/docs/api-reference/api/operations/create-dockercompose-application) |
| GET | `/applications/{uuid}` | Get application by UUID | [Link](https://coolify.io/docs/api-reference/api/operations/get-application-by-uuid) |
| PATCH | `/applications/{uuid}` | Update application | [Link](https://coolify.io/docs/api-reference/api/operations/update-application-by-uuid) |
| DELETE | `/applications/{uuid}` | Delete application | [Link](https://coolify.io/docs/api-reference/api/operations/delete-application-by-uuid) |
| GET | `/applications/{uuid}/start` | Start application | [Link](https://coolify.io/docs/api-reference/api/operations/start-application-by-uuid) |
| GET | `/applications/{uuid}/stop` | Stop application | [Link](https://coolify.io/docs/api-reference/api/operations/stop-application-by-uuid) |
| GET | `/applications/{uuid}/restart` | Restart application | [Link](https://coolify.io/docs/api-reference/api/operations/restart-application-by-uuid) |
| GET | `/applications/{uuid}/logs` | Get application logs | [Link](https://coolify.io/docs/api-reference/api/operations/get-application-logs-by-uuid) |
| GET | `/applications/{uuid}/envs` | List env vars | [Link](https://coolify.io/docs/api-reference/api/operations/list-envs-by-application-uuid) |
| POST | `/applications/{uuid}/envs` | Create env var | [Link](https://coolify.io/docs/api-reference/api/operations/create-env-by-application-uuid) |
| PATCH | `/applications/{uuid}/envs` | Update env vars | [Link](https://coolify.io/docs/api-reference/api/operations/update-env-by-application-uuid) |
| DELETE | `/applications/{uuid}/envs/{env_uuid}` | Delete env var | [Link](https://coolify.io/docs/api-reference/api/operations/delete-env-by-uuid) |

**Lifecycle**:

**Create**:
1. Validate server, project references exist
2. If `adopt` is true:
   - Call `GET /applications` to list all existing applications
   - Search for an application with matching name within the same project/environment
   - If found:
     - Verify the application type matches the requested type
     - If types differ, fail with error (cannot adopt different application types)
     - Store the existing application's UUID
     - Proceed to update phase with any changed properties (git settings, build commands, domains, etc.)
     - Return the adopted application details
   - If not found, proceed with normal creation
3. Choose appropriate creation endpoint based on type:
   - Public repository: `POST /applications` (public)
   - Private GitHub: `POST /applications` (github-app)
   - Private Deploy Key: `POST /applications` (deploy-key)
   - Dockerfile: `POST /applications` (dockerfile)
   - Docker Image: `POST /applications` (docker-image)
   - Docker Compose: `POST /applications` (docker-compose)
4. Example for public git repository:
   ```json
   {
     "name": "my-app",
     "description": "My application",
     "server_uuid": "server-uuid",
     "project_uuid": "project-uuid",
     "environment_name": "production",
     "git_repository": "https://github.com/user/repo",
     "git_branch": "main",
     "build_pack": "nixpacks",
     "ports": {"3000": 3000},
     "domains": ["app.example.com"]
   }
   ```
4. Set environment variables if provided
5. Configure domains
6. Optionally trigger initial deployment
7. Return application details

**Update**:
1. Fetch current application using `GET /applications/{uuid}`
2. Check for immutable field changes:
   - Server cannot be changed
   - Project cannot be changed
   - Environment cannot be changed
   - Type cannot be changed
3. Call `PATCH /applications/{uuid}` with updates:
   ```json
   {
     "name": "updated-name",
     "description": "updated description",
     "git_branch": "develop",
     "build_command": "npm run build",
     "start_command": "npm start"
   }
   ```
4. Update environment variables separately if needed
5. Update domains if changed
6. Trigger new deployment if source changed
7. Return updated application details

**Delete**:
1. Stop application if running: `GET /applications/{uuid}/stop`
2. Remove all environment variables
3. Remove all associated domains
4. Call `DELETE /applications/{uuid}`
5. Clean up any volumes or persistent data
6. Verify deletion succeeded

**Replace Required When**:
- Server changes
- Project or Environment changes
- Application type changes

### 7. Database

**Description**: Managed database instances.

**Properties**:
- `name` (string, required): Database name
- `type` (string, required): Database type (postgresql, mysql, mariadb, mongodb, redis, keydb, clickhouse, dragonfly)
- `server` (string | Server, required): Target server
- `project` (string | Project, required): Parent project
- `environment` (string, required): Target environment name
- `version` (string, optional): Database version
- `databaseName` (string, optional): Initial database name
- `databaseUser` (string, optional): Database user
- `databasePassword` (string, optional): Database password
- `databaseRootPassword` (string, optional): Root password
- `publicPort` (number, optional): Expose database publicly
- `limits` (object, optional): Resource limits (cpuShares, memory, etc.)
- `isPublic` (boolean, optional): Make database publicly accessible
- `adopt` (boolean, optional, default: false): Adopt existing resource if found

**Outputs**:
- `databaseId` (string): UUID of the database
- `databaseName` (string): Display name
- `type` (string): Database type
- `version` (string): Database version
- `status` (string): Current status
- `internalUrl` (string): Internal connection URL
- `publicUrl` (string, optional): Public connection URL if exposed

**Usage Example**:
```typescript
import { Database, Server, Project } from "@alchemy/coolify";

// Dependencies
const server = await Server("db-server", { /* ... */ });
const project = await Project("my-project", { /* ... */ });

// PostgreSQL database
const postgres = await Database("main-db", {
  name: "app-postgres",
  type: "postgresql",
  server: server,
  project: project,
  environment: "production",
  version: "15",
  databaseName: "myapp",
  databaseUser: "appuser",
  databasePassword: process.env.DB_PASSWORD!,
  databaseRootPassword: process.env.DB_ROOT_PASSWORD!,
  limits: {
    cpuShares: 2048,
    memory: "4096M",
  },
});

// Redis cache
const redis = await Database("cache", {
  name: "redis-cache",
  type: "redis",
  server: server,
  project: project,
  environment: "production",
  version: "7",
  isPublic: false,
});

// MongoDB with public access
const mongo = await Database("mongo-db", {
  name: "app-mongodb",
  type: "mongodb",
  server: server,
  project: project,
  environment: "staging",
  version: "6",
  databaseName: "myapp",
  databaseUser: "mongouser",
  databasePassword: process.env.MONGO_PASSWORD!,
  databaseRootPassword: process.env.MONGO_ROOT_PASSWORD!,
  isPublic: true,
  publicPort: 27017,
});

// Access outputs
console.log(postgres.internalUrl); // Internal connection string
console.log(mongo.publicUrl); // Public connection string (if exposed)
```

**API Endpoints**:
| Method | Endpoint | Description | Docs |
|--------|----------|-------------|------|
| GET | `/databases` | List all databases | [Link](https://coolify.io/docs/api-reference/api/operations/list-databases) |
| POST | `/databases/postgresql` | Create PostgreSQL | [Link](https://coolify.io/docs/api-reference/api/operations/create-postgresql-database) |
| POST | `/databases/mysql` | Create MySQL | [Link](https://coolify.io/docs/api-reference/api/operations/create-mysql-database) |
| POST | `/databases/mariadb` | Create MariaDB | [Link](https://coolify.io/docs/api-reference/api/operations/create-mariadb-database) |
| POST | `/databases/mongodb` | Create MongoDB | [Link](https://coolify.io/docs/api-reference/api/operations/create-mongodb-database) |
| POST | `/databases/redis` | Create Redis | [Link](https://coolify.io/docs/api-reference/api/operations/create-redis-database) |
| POST | `/databases/keydb` | Create KeyDB | [Link](https://coolify.io/docs/api-reference/api/operations/create-keydb-database) |
| POST | `/databases/clickhouse` | Create ClickHouse | [Link](https://coolify.io/docs/api-reference/api/operations/create-clickhouse-database) |
| POST | `/databases/dragonfly` | Create DragonFly | [Link](https://coolify.io/docs/api-reference/api/operations/create-dragonfly-database) |
| GET | `/databases/{uuid}` | Get database by UUID | [Link](https://coolify.io/docs/api-reference/api/operations/get-database-by-uuid) |
| PATCH | `/databases/{uuid}` | Update database | [Link](https://coolify.io/docs/api-reference/api/operations/update-database-by-uuid) |
| DELETE | `/databases/{uuid}` | Delete database | [Link](https://coolify.io/docs/api-reference/api/operations/delete-database-by-uuid) |
| GET | `/databases/{uuid}/start` | Start database | [Link](https://coolify.io/docs/api-reference/api/operations/start-database-by-uuid) |
| GET | `/databases/{uuid}/stop` | Stop database | [Link](https://coolify.io/docs/api-reference/api/operations/stop-database-by-uuid) |
| GET | `/databases/{uuid}/restart` | Restart database | [Link](https://coolify.io/docs/api-reference/api/operations/restart-database-by-uuid) |

**Lifecycle**:

**Create**:
1. Validate server, project references exist
2. If `adopt` is true:
   - Call `GET /databases` to list all existing databases
   - Search for a database with matching name within the same project/environment
   - If found:
     - Verify the database type matches the requested type
     - If types differ, fail with error (cannot adopt different database types)
     - Store the existing database's UUID
     - Proceed to update phase with any changed properties (limits, public settings, etc.)
     - Note: Password fields cannot be updated on existing databases
     - Return the adopted database details
   - If not found, proceed with normal creation
3. Choose appropriate endpoint based on database type
4. Generate secure passwords if not provided
5. Example for PostgreSQL:
   ```json
   {
     "name": "my-postgres",
     "server_uuid": "server-uuid",
     "project_uuid": "project-uuid",
     "environment_name": "production",
     "postgres_version": "15",
     "postgres_db": "myapp",
     "postgres_user": "myuser",
     "postgres_password": "secure-password",
     "postgres_root_password": "root-password",
     "is_public": false,
     "public_port": null,
     "limits": {
       "cpuShares": 1024,
       "memory": "2048M"
     }
   }
   ```
5. Coolify allocates storage volume
6. Starts database container
7. Wait for database to be ready (poll status)
8. Return database details with connection URLs

**Update**:
1. Fetch current database using `GET /databases/{uuid}`
2. Check for immutable fields:
   - Type cannot be changed
   - Server cannot be changed
   - Project/Environment cannot be changed
3. Version upgrades require careful consideration
4. Call `PATCH /databases/{uuid}` with allowed updates:
   ```json
   {
     "name": "updated-name",
     "is_public": true,
     "public_port": 5432,
     "limits": {
       "memory": "4096M"
     }
   }
   ```
5. Restart database if configuration changed
6. Return updated database details

**Delete**:
1. Stop database if running: `GET /databases/{uuid}/stop`
2. Important: Warn about data loss
3. Create final backup if backup enabled
4. Call `DELETE /databases/{uuid}`
5. Volumes are automatically removed
6. Verify deletion succeeded

**Replace Required When**:
- Database type changes
- Server changes
- Project or Environment changes
- Major version upgrades (e.g., PostgreSQL 14 to 15)

### 8. Service

**Description**: Docker Compose based services or one-click deployments.

**Properties**:
- `name` (string, required): Service name
- `type` (string, required): Service type (e.g., "plausible", "umami", or custom compose)
- `server` (string | Server, required): Target server
- `project` (string | Project, required): Parent project
- `environment` (string, required): Target environment name
- `dockerComposeRaw` (string, conditional): Raw docker-compose.yml content (for custom type)
- `environmentVariables` (Record<string, string>, optional): Environment variables
- `secrets` (Record<string, string>, optional): Secret environment variables
- `domains` (Record<string, string[]>, optional): Domain mappings per service
- `adopt` (boolean, optional, default: false): Adopt existing resource if found

**Outputs**:
- `serviceId` (string): UUID of the service
- `serviceName` (string): Display name
- `type` (string): Service type
- `status` (string): Current status
- `services` (object): Individual service statuses

**Usage Example**:
```typescript
import { Service, Server, Project } from "@alchemy/coolify";

// Dependencies
const server = await Server("service-server", { /* ... */ });
const project = await Project("my-project", { /* ... */ });

// Pre-defined service (Plausible Analytics)
const analytics = await Service("analytics", {
  name: "plausible",
  type: "plausible",
  server: server,
  project: project,
  environment: "production",
  environmentVariables: {
    BASE_URL: "https://analytics.example.com",
    SECRET_KEY_BASE: process.env.PLAUSIBLE_SECRET!,
  },
  domains: {
    "plausible": ["analytics.example.com"],
  },
});

// Custom Docker Compose service
const customService = await Service("custom-stack", {
  name: "my-custom-service",
  type: "custom",
  server: server,
  project: project,
  environment: "staging",
  dockerComposeRaw: `
version: '3.8'
services:
  web:
    image: nginx:alpine
    ports:
      - "80:80"
  api:
    image: node:18-alpine
    command: node server.js
    environment:
      - NODE_ENV=production
`,
  environmentVariables: {
    API_KEY: "xyz123",
  },
  domains: {
    "web": ["www.example.com"],
    "api": ["api.example.com"],
  },
});

// Umami Analytics service
const umami = await Service("umami-analytics", {
  name: "umami",
  type: "umami",
  server: server,
  project: project,
  environment: "production",
  adopt: true, // Adopt if already exists
});

// Access outputs
console.log(analytics.serviceId); // UUID
console.log(customService.services); // Status of individual containers
```

**API Endpoints**:
| Method | Endpoint | Description | Docs |
|--------|----------|-------------|------|
| GET | `/services` | List all services | [Link](https://coolify.io/docs/api-reference/api/operations/list-services) |
| POST | `/services` | Create a new service | [Link](https://coolify.io/docs/api-reference/api/operations/create-service) |
| GET | `/services/{uuid}` | Get service by UUID | [Link](https://coolify.io/docs/api-reference/api/operations/get-service-by-uuid) |
| PATCH | `/services/{uuid}` | Update service | [Link](https://coolify.io/docs/api-reference/api/operations/update-service-by-uuid) |
| DELETE | `/services/{uuid}` | Delete service | [Link](https://coolify.io/docs/api-reference/api/operations/delete-service-by-uuid) |
| GET | `/services/{uuid}/start` | Start service | [Link](https://coolify.io/docs/api-reference/api/operations/start-service-by-uuid) |
| GET | `/services/{uuid}/stop` | Stop service | [Link](https://coolify.io/docs/api-reference/api/operations/stop-service-by-uuid) |
| GET | `/services/{uuid}/restart` | Restart service | [Link](https://coolify.io/docs/api-reference/api/operations/restart-service-by-uuid) |
| GET | `/services/{uuid}/envs` | List service env vars | [Link](https://coolify.io/docs/api-reference/api/operations/list-envs-by-service-uuid) |
| POST | `/services/{uuid}/envs` | Create service env var | [Link](https://coolify.io/docs/api-reference/api/operations/create-env-by-service-uuid) |
| PATCH | `/services/{uuid}/envs` | Update service env vars | [Link](https://coolify.io/docs/api-reference/api/operations/update-env-by-service-uuid) |
| DELETE | `/services/{uuid}/envs/{env_uuid}` | Delete service env var | [Link](https://coolify.io/docs/api-reference/api/operations/delete-env-by-service-uuid) |

**Lifecycle**:

**Create**:
1. Validate server, project references exist
2. If `adopt` is true:
   - Call `GET /services` to list all existing services
   - Search for a service with matching name within the same project/environment
   - If found:
     - Verify the service type matches (for non-custom types)
     - If types differ and neither is custom, fail with error
     - Store the existing service's UUID
     - Proceed to update phase with any changed properties (docker-compose, env vars, domains)
     - Return the adopted service details
   - If not found, proceed with normal creation
3. For predefined services (plausible, umami, etc.):
   ```json
   {
     "type": "plausible",
     "name": "analytics",
     "server_uuid": "server-uuid",
     "project_uuid": "project-uuid",
     "environment_name": "production"
   }
   ```
3. For custom docker-compose:
   ```json
   {
     "type": "custom",
     "name": "my-service",
     "server_uuid": "server-uuid",
     "project_uuid": "project-uuid",
     "environment_name": "production",
     "docker_compose_raw": "version: '3.8'\nservices:\n  web:\n    image: nginx"
   }
   ```
4. Parse and validate docker-compose if custom
5. Set environment variables
6. Configure domains per service
7. Start all service containers
8. Return service details with status

**Update**:
1. Fetch current service using `GET /services/{uuid}`
2. Check for immutable fields:
   - Type cannot be changed (except custom)
   - Server cannot be changed
   - Project/Environment cannot be changed
3. Call `PATCH /services/{uuid}` with updates:
   ```json
   {
     "name": "updated-name",
     "docker_compose_raw": "updated compose content"
   }
   ```
4. Update environment variables separately
5. Perform rolling update of containers
6. Return updated service details

**Delete**:
1. Stop all service containers: `GET /services/{uuid}/stop`
2. Remove environment variables
3. Remove domain configurations
4. Call `DELETE /services/{uuid}`
5. Remove volumes and networks
6. Verify deletion succeeded

**Replace Required When**:
- Service type changes (except to/from custom)
- Server changes
- Project or Environment changes

### 9. Deployment

**Description**: Represents a deployment of an application.

**Properties**:
- `application` (string | Application, required): Application to deploy
- `tag` (string, optional): Docker tag to deploy
- `force` (boolean, optional): Force deployment even if no changes
- `adopt` (boolean, optional, default: false): Adopt existing deployment if found (Note: deployments are immutable, so this has limited use)

**Outputs**:
- `deploymentId` (string): UUID of the deployment
- `status` (string): Deployment status (queued, in_progress, success, failed)
- `logs` (string): Deployment logs
- `createdAt` (string): Deployment timestamp

**Usage Example**:
```typescript
import { Deployment, Application } from "@alchemy/coolify";

// First, reference an existing application
const app = await Application("my-app", {
  name: "frontend",
  // ... other props
  adopt: true, // Use existing app
});

// Deploy latest from configured branch
const latestDeployment = await Deployment("deploy-latest", {
  application: app,
});

// Deploy specific tag
const tagDeployment = await Deployment("deploy-v1.2.3", {
  application: app,
  tag: "v1.2.3",
});

// Force deployment even if no changes
const forcedDeployment = await Deployment("deploy-forced", {
  application: app,
  force: true,
});

// Deploy using application UUID directly
const directDeployment = await Deployment("deploy-direct", {
  application: "app-uuid-12345",
  tag: "latest",
});

// Access outputs
console.log(latestDeployment.status); // "queued", "in_progress", "success", "failed"
console.log(latestDeployment.deploymentId); // UUID
console.log(latestDeployment.logs); // Deployment logs

// Note: Deployments are immutable - use adopt for idempotency
const idempotentDeploy = await Deployment("deploy-idempotent", {
  application: app,
  tag: "v1.2.3",
  adopt: true, // Will return existing deployment if already deployed
});
```

**API Endpoints**:
| Method | Endpoint | Description | Docs |
|--------|----------|-------------|------|
| GET | `/deployments` | List all deployments | [Link](https://coolify.io/docs/api-reference/api/operations/list-deployments) |
| GET | `/deployments/{uuid}` | Get deployment by UUID | [Link](https://coolify.io/docs/api-reference/api/operations/get-deployment-by-uuid) |
| GET | `/applications/{uuid}/deployments` | List app deployments | [Link](https://coolify.io/docs/api-reference/api/operations/list-deployments-by-application-uuid) |
| POST | `/applications/{uuid}/deployments` | Deploy application | [Link](https://coolify.io/docs/api-reference/api/operations/deploy-application) |

**Lifecycle**:

**Create**:
1. Validate application exists and is properly configured
2. If `adopt` is true:
   - Note: Deployments are immutable historical records, adoption is not typical
   - Call `GET /applications/{uuid}/deployments` to list existing deployments
   - Search for a recent deployment with matching tag (if specified)
   - If found and status is 'success':
     - Return the existing deployment details without creating a new one
     - This effectively makes the operation idempotent
   - If not found or failed, proceed with new deployment
3. If tag specified, verify it exists in repository/registry
4. Call `POST /applications/{uuid}/deployments`:
   ```json
   {
     "tag": "v1.2.3",
     "force": false
   }
   ```
4. Deployment is queued and processed asynchronously
5. Poll deployment status using `GET /deployments/{uuid}`
6. Stream logs during deployment if needed
7. Return deployment result with final status

**Update**:
- Deployments are immutable - create new deployment for changes

**Delete**:
- Deployments are historical records and typically not deleted
- They serve as audit trail for application changes
- If needed, would only remove deployment record, not affect running application

**Replace Required When**:
- Not applicable (deployments are immutable)

## Utility Endpoints

### Default Category APIs

These are utility endpoints that don't represent resources:

| Method | Endpoint | Description | Docs |
|--------|----------|-------------|------|
| GET | `/version` | Get Coolify version | [Link](https://coolify.io/docs/api-reference/api/operations/version) |
| GET | `/enable-api` | Enable API functionality | [Link](https://coolify.io/docs/api-reference/api/operations/enable-api) |
| GET | `/disable-api` | Disable API functionality | [Link](https://coolify.io/docs/api-reference/api/operations/disable-api) |
| GET | `/healthcheck` | Health check (no auth) | [Link](https://coolify.io/docs/api-reference/api/operations/healthcheck) |

### Resources Listing API

| Method | Endpoint | Description | Docs |
|--------|----------|-------------|------|
| GET | `/resources` | Get all resources | [Link](https://coolify.io/docs/api-reference/api/operations/list-resources) |

This endpoint returns a combined list of all applications, databases, and services across all projects and environments.

## Implementation Notes

1. **Authentication**: All resources require API token configuration at the provider level
2. **Idempotency**: Use Coolify's UUID system to ensure idempotent operations
3. **Error Handling**: Implement proper retry logic for transient failures
4. **Resource Dependencies**: Enforce proper dependency ordering in Alchemy's DAG
5. **Validation**: Perform client-side validation before API calls to improve UX
6. **Status Monitoring**: Implement status checking for long-running operations
7. **Secrets Management**: Use Alchemy's secret management for sensitive values
8. **Backup Strategy**: For databases, consider automated backup configuration
9. **Network Isolation**: Leverage Docker networks for security between resources
10. **Resource Limits**: Implement proper CPU/memory limits for containers
11. **Environment Variables**: Handle both regular and secret environment variables appropriately
12. **Domain Management**: Ensure proper SSL certificate generation for custom domains