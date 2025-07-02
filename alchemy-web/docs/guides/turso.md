---
order: 10
title: Turso
description: Quick guide to setting up and managing Turso databases with Alchemy.
---

# Getting Started with Turso

This guide will set you up with a globally distributed SQLite database using Turso and Alchemy.

## Install

First, you'll need a Turso account and the Turso CLI:

::: code-group

```sh [bun]
bun create alchemy my-turso-app
cd my-turso-app
bun add alchemy @alchemy/turso
curl -sSfL https://get.tur.so/install.sh | bash
```

```sh [npm]
npm create alchemy my-turso-app
cd my-turso-app
npm install alchemy @alchemy/turso
curl -sSfL https://get.tur.so/install.sh | bash
```

```sh [pnpm]
pnpm create alchemy my-turso-app
cd my-turso-app
pnpm add alchemy @alchemy/turso
curl -sSfL https://get.tur.so/install.sh | bash
```

```sh [yarn]
yarn create alchemy my-turso-app
cd my-turso-app
yarn add alchemy @alchemy/turso
curl -sSfL https://get.tur.so/install.sh | bash
```

:::

## Credentials

Sign up for Turso and get your API credentials:

1. Go to [app.turso.tech](https://app.turso.tech) and create an account
2. Generate an API token from your account settings
3. Note your organization slug from the URL

Add these to your `.env` file:

```env
TURSO_API_TOKEN=your_api_token_here
TURSO_ORGANIZATION_SLUG=your_org_slug_here
```

## Create a Turso application

Initialize a new Alchemy project if you haven't already:

::: code-group

```sh [bun]
bun create alchemy my-turso-app
cd my-turso-app
```

```sh [npm]
npm create alchemy my-turso-app
cd my-turso-app
```

```sh [pnpm]
pnpm create alchemy my-turso-app
cd my-turso-app
```

```sh [yarn]
yarn create alchemy my-turso-app
cd my-turso-app
```

:::

## Create `alchemy.run.ts`

Create your infrastructure script to set up Turso databases:

```typescript
/// <reference types="@types/node" />

import alchemy from "alchemy";
import { 
  Group, 
  Database, 
  DatabaseAuthToken,
  ApiToken 
} from "@alchemy/turso";

const app = await alchemy("my-turso-app");

// Create an API token for programmatic access
const apiToken = await ApiToken("main-token", {
  name: "production-api-token",
});

// Create a multi-region group for global distribution
const globalGroup = await Group("global", {
  locations: ["iad", "lhr", "syd"],
  primary: "iad",
});

// Create a production database
const productionDb = await Database("production", {
  group: globalGroup,
  size_limit: "1GB",
});

// Create a database auth token for connecting to the database
const dbAuthToken = await DatabaseAuthToken("prod-token", {
  database: productionDb,
  expiration: "never",
  authorization: "full-access",
});

// Create a development database for testing
const devDb = await Database("development", {
  group: "default", // Use default single-region group
});

console.log({
  productionUrl: `https://${productionDb.Hostname}`,
  developmentUrl: `https://${devDb.Hostname}`,
  authToken: dbAuthToken.jwt,
  apiToken: apiToken.token,
});

await app.finalize();
```

This script creates:
- A multi-region database group for production
- Production and development databases
- Authentication tokens for accessing the databases
- An API token for managing resources

## Deploy

Run the `alchemy.run.ts` script to deploy your Turso infrastructure:

::: code-group

```sh [bun]
bun ./alchemy.run.ts
```

```sh [npm]
npx tsx ./alchemy.run.ts
```

```sh [pnpm]
pnpm tsx ./alchemy.run.ts
```

```sh [yarn]
yarn tsx ./alchemy.run.ts
```

:::

You should see output similar to:

```sh
{
  productionUrl: "https://production-your-org.turso.io",
  developmentUrl: "https://development-your-org.turso.io", 
  authToken: "eyJhbGciOiJFZDI1NTE5IiwidHlwIjoiSldUIn0...",
  apiToken: "token_1234567890abcdef"
}
```

You can now connect to your databases using these URLs and tokens with any SQLite-compatible client or the Turso SDK.

## Tear Down

That's it! You can now tear down the infrastructure (if you want to):

::: code-group

```sh [bun]
bun ./alchemy.run.ts --destroy
```

```sh [npm]
npx tsx ./alchemy.run.ts --destroy
```

```sh [pnpm]
pnpm tsx ./alchemy.run.ts --destroy
```

```sh [yarn]
yarn tsx ./alchemy.run.ts --destroy
```

:::

## Next Steps

Now that you have your Turso databases set up, you can:

- Connect to your databases using the [Turso SDK](https://docs.turso.tech/sdk/introduction)
- Set up database schemas and migrations
- Configure database branching for development workflows
- Integrate with your application using the connection URLs and auth tokens

For more advanced use cases, check out the [Turso provider documentation](../providers/turso/index.md).