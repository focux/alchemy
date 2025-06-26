---
order: 3
title: State
description: Understand how Alchemy tracks and manages infrastructure state using transparent, pluggable storage. Learn about state files, customizing storage backends, and securing sensitive data.
---

# State

Alchemy uses a transparent and pluggable state management system to track resource lifecycles and enable idempotent operations. It's designed to be simple, with multiple backend options ranging from local files to cloud storage.

## What is State in Alchemy?

State in Alchemy consists of resource data that tracks the current status, properties, and outputs of each resource. By default, it's stored in JSON files in a `.alchemy` directory, organized by app and stage:

```
.alchemy/
  my-app/
    dev/
      my-resource.json
      my-other-resource.json
```

## State File Structure

Each state file contains the full information about a resource:

```json
{
  "provider": "service::ResourceName",
  "data": {},
  "status": "updated",
  "output": {
    "id": "resource-123",
    "name": "My Resource",
    "createdAt": 1679012345678
  },
  "props": {
    "name": "My Resource",
    "description": "This is a test resource"
  }
}
```

The state file includes:

- **provider**: The resource type identifier
- **data**: Internal provider-specific data
- **status**: Current lifecycle status (created, updated, deleted)
- **output**: The resource's current output values
- **props**: The resource's input properties

## How Alchemy Uses State

Alchemy uses state to determine the appropriate action for each resource:

1. **No state file**: The resource is created
2. **State exists + props unchanged**: The resource is skipped
3. **State exists + props changed**: The resource is updated
4. **Resource removed from code**: The resource is deleted

This approach enables idempotent operations - running the same code multiple times produces the same result, avoiding duplicate resource creation.

## State Location

By default, Alchemy stores state files in the `.alchemy` directory in your project root. This approach has several benefits:

- **Transparency**: State files are plain JSON and can be inspected and modified manually
- **Versioning**: State can be committed to source control with your code
- **Portability**: No external service dependencies required

## State Inspection

State files can be directly inspected:

```bash
cat .alchemy/my-app/dev/my-resource.json
```

This transparency helps with debugging and understanding what Alchemy is doing.

## Customizing State Storage

### Change `.alchemy` directory location

Perhaps you want to change the location of the `.alchemy` directory in a monorepo.

```typescript
const app = await alchemy("my-app", {
  stateStore: (scope) => new FileSystemStateStore(scope, {
    rootDir: path.resolve(import.meta.dir, "..", ".alchemy")
  })
});
```

### Durable Objects State Store (Recommended)

DOStateStore provides high-performance cloud state storage using Cloudflare Durable Objects backed by SQLite. It's the recommended approach for production deployments and CI/CD environments.

**Benefits:**
- High performance with SQLite-backed Durable Objects
- Automatic scaling and geographic distribution
- Strong consistency guarantees
- No external database setup required

#### Setup Guide

**Step 1: Generate State Token**

First, generate a secure token for authenticating with your state store:

```bash
# Generate a secure random token (32+ characters recommended)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Or use openssl
openssl rand -hex 32

# Or use a password manager to generate a secure random string
```

**Step 2: Set Environment Variables**

```bash
# Required: Authentication token for state store
export ALCHEMY_STATE_TOKEN="your-generated-token-here"

# Required: Cloudflare API credentials (choose one option)
# Option 1: API Token (recommended)
export CLOUDFLARE_API_TOKEN="your-api-token"

# Option 2: API Key + Email
export CLOUDFLARE_API_KEY="your-api-key"
export CLOUDFLARE_EMAIL="your-email@example.com"

# Optional: Specific account ID (auto-detected if not provided)
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
```

> [!TIP]
> For Cloudflare API credentials, see the [Cloudflare Auth Guide](../guides/cloudflare-auth.md) for detailed setup instructions.

**Step 3: Use DOStateStore in Your App**

```typescript
import { DOStateStore } from "alchemy/cloudflare";

const app = await alchemy("my-app", {
  stage: "prod",
  phase: process.argv.includes("--destroy") ? "destroy" : "up",
  stateStore: (scope) => new DOStateStore(scope)
});
```

The DOStateStore will automatically:
1. Create a Cloudflare Worker named "alchemy-state" (or your custom name)
2. Deploy the state management logic with Durable Objects
3. Secure the worker with your `ALCHEMY_STATE_TOKEN`

#### Advanced Configuration

You can customize the DOStateStore behavior:

```typescript
import { DOStateStore } from "alchemy/cloudflare";

const app = await alchemy("my-app", {
  stage: "prod", 
  phase: process.argv.includes("--destroy") ? "destroy" : "up",
  stateStore: (scope) => new DOStateStore(scope, {
    // Optional: Custom state key prefix (default: "alchemy")
    prefix: "my-company",
    
    // Optional: Explicit Cloudflare credentials
    apiKey: alchemy.secret(process.env.CLOUDFLARE_API_KEY),
    email: process.env.CLOUDFLARE_EMAIL,
    
    // Optional: Worker configuration
    worker: {
      name: "my-app-state",  // Custom worker name
      token: "override-token", // Override ALCHEMY_STATE_TOKEN
      force: false // Force worker recreation
    }
  })
});
```

#### Using Existing Worker

If you've already deployed a state worker, you can reference it by URL:

```typescript
const app = await alchemy("my-app", {
  stateStore: (scope) => new DOStateStore(scope, {
    worker: {
      url: "https://my-state-worker.my-subdomain.workers.dev",
      token: process.env.ALCHEMY_STATE_TOKEN
    }
  })
});
```

#### Troubleshooting

**Token Authentication Errors**
- Ensure `ALCHEMY_STATE_TOKEN` is set and matches what the worker expects
- Verify the token is at least 32 characters long for security
- Check that the token doesn't contain special characters that might be escaped

**Worker Deployment Issues**
- Verify your Cloudflare API credentials have Workers:Edit permissions
- Check that your account has available Worker deployments
- Ensure the worker name doesn't conflict with existing workers

**Performance Considerations**
- DOStateStore provides better performance than file-based stores for large infrastructures
- State operations are automatically cached and optimized
- Geographic distribution happens automatically through Cloudflare's edge network


### R2 Rest State Store

Alchemy also supports state storage using Cloudflare R2, though DOStateStore is recommended for better performance:

```typescript
// Example with Cloudflare R2 state store
const app = await alchemy("my-app", {
  stage: "prod",
  phase: process.argv.includes("--destroy") ? "destroy" : "up",
  stateStore: (scope) => new R2RestStateStore(scope, {
    apiKey: alchemy.secret(process.env.CLOUDFLARE_API_KEY),
    email: process.env.CLOUDFLARE_EMAIL,
    bucketName: process.env.CLOUDFLARE_BUCKET_NAME!,
  })
});
```

### S3 State Store

For AWS-based deployments, use S3StateStore for reliable cloud state storage with Amazon S3:

```typescript
import { S3StateStore } from "alchemy/aws";

const app = await alchemy("my-app", {
  stage: "prod",
  phase: process.argv.includes("--destroy") ? "destroy" : "up",
  stateStore: (scope) => new S3StateStore(scope, {
    bucketName: "my-app-alchemy-state",
    region: "us-east-1"
  })
});
```

S3StateStore provides durable, scalable state storage with automatic retry logic and proper error handling. The S3 bucket must be created beforehand, and AWS credentials must be configured with appropriate S3 permissions.

> [!TIP]
> Learn how to implement your own state storage in [Custom State Stores Guide](../guides/custom-state-store.md)

## Security and Secrets

State files may contain sensitive information. Alchemy provides a mechanism to encrypt sensitive values using the `alchemy.secret()` function:

```typescript
const apiKey = alchemy.secret(process.env.API_KEY);

await ApiResource("my-api", {
  key: apiKey
});
```

Secrets are encrypted in state files:

```json
{
  "props": {
    "key": {
      "@secret": "Tgz3e/WAscu4U1oanm5S4YXH..."
    }
  }
}
```

> [!IMPORTANT]
> Always use `alchemy.secret()` for sensitive values to prevent them from being stored in plain text.

> [!NOTE]
> Learn more about secrets management in [Concepts: Secrets](./secret.md)
