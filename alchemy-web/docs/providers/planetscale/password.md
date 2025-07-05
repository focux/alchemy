---
title: PlanetScale Password
description: Learn how to create and manage database passwords for PlanetScale branches using Alchemy.
---

# Password

The Password resource lets you create and manage [PlanetScale database passwords](https://planetscale.com/docs/concepts/password) for secure database access with specific roles and permissions.

## Minimal Example

Create a basic reader password for a database branch:

```ts
import { Password } from "alchemy/planetscale";

const readerPassword = await Password("app-reader", {
  name: "app-reader",
  organizationId: "my-org",
  databaseName: "my-app-db",
  branchName: "main",
  role: "reader"
});

// Access connection details
console.log(`Host: ${readerPassword.password.host}`);
console.log(`Username: ${readerPassword.password.username}`);
console.log(`Password: ${readerPassword.password.password.unencrypted}`);
```

## Writer Password with TTL

Create a writer password that expires after 24 hours:

```ts
import { Password } from "alchemy/planetscale";

const writerPassword = await Password("app-writer", {
  name: "app-writer",
  organizationId: "my-org",
  databaseName: "my-app-db",
  branchName: "development",
  role: "writer",
  ttl: 86400 // 24 hours in seconds
});

// Password will expire at the specified time
console.log(`Expires at: ${writerPassword.expiresAt}`);
```

## Admin Password with IP Restrictions

Create an admin password that only allows connections from specific IP addresses:

```ts
import { Password } from "alchemy/planetscale";

const adminPassword = await Password("admin-access", {
  name: "admin-access",
  organizationId: "my-org",
  databaseName: "my-app-db",
  branchName: "main",
  role: "admin",
  cidrs: ["203.0.113.0/24", "198.51.100.0/24"],
  ttl: 3600 // 1 hour
});
```

## Password with Custom API Key

Create a password using a specific API key instead of the default environment variable:

```ts
import { Password } from "alchemy/planetscale";

const password = await Password("custom-auth", {
  name: "custom-auth",
  organizationId: "my-org",
  databaseName: "my-app-db",
  branchName: "main",
  role: "readwriter",
  apiKey: alchemy.secret(process.env.CUSTOM_PLANETSCALE_TOKEN)
});
```

## Read Replica Password

Create a password for accessing a read replica:

```ts
import { Password } from "alchemy/planetscale";

const replicaPassword = await Password("replica-reader", {
  name: "replica-reader",
  organizationId: "my-org",
  databaseName: "my-app-db",
  branchName: "main",
  role: "reader",
  replica: true
});
```

## Using with Database and Branch Resources

Combine Password with Database and Branch resources for a complete setup:

```ts
import { Database, Branch, Password } from "alchemy/planetscale";

// Create a database
const database = await Database("my-app-db", {
  name: "my-app-db",
  organizationId: "my-org",
  clusterSize: "PS_10"
});

// Create a development branch
const devBranch = await Branch("feature-123", {
  name: "feature-123",
  organizationId: "my-org",
  databaseName: database.name,
  parentBranch: "main",
  isProduction: false
});

// Create passwords for the branch
const readerPassword = await Password("dev-reader", {
  name: "dev-reader",
  organizationId: "my-org",
  databaseName: database.name,
  branchName: devBranch.name,
  role: "reader"
});

const writerPassword = await Password("dev-writer", {
  name: "dev-writer",
  organizationId: "my-org",
  databaseName: database.name,
  branchName: devBranch.name,
  role: "writer",
  ttl: 86400 // 24 hours
});
```

## Password Roles

PlanetScale supports different password roles:

- **`reader`**: Read-only access to the database
- **`writer`**: Write access to the database (includes read permissions)
- **`readwriter`**: Equivalent to writer role
- **`admin`**: Full administrative access including DDL operations

## Security Best Practices

When working with database passwords, follow these security best practices:

1. **Use appropriate roles**: Grant the minimum necessary permissions
2. **Set TTL values**: Use time-limited passwords for temporary access
3. **Restrict IP access**: Use CIDR blocks to limit access to specific networks
4. **Rotate passwords regularly**: Create new passwords and delete old ones periodically
5. **Use environment variables**: Store API keys and connection strings securely

## Connection String Usage

The password resource provides connection details that can be used with MySQL clients:

```ts
import { Password } from "alchemy/planetscale";
import mysql from "mysql2/promise";

const password = await Password("app-db-access", {
  name: "app-db-access",
  organizationId: "my-org",
  databaseName: "my-app-db",
  branchName: "main",
  role: "readwriter"
});

// Create MySQL connection
const connection = await mysql.createConnection({
  host: password.password.host,
  user: password.password.username,
  password: password.password.password.unencrypted,
  database: "my-app-db",
  ssl: { rejectUnauthorized: true }
});

// Use the connection
const [rows] = await connection.execute('SELECT * FROM users LIMIT 10');
console.log(rows);
```