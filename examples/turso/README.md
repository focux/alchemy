# Turso Example

This example demonstrates how to use Alchemy to provision and manage Turso databases, including:

- Creating API tokens for authentication
- Setting up database groups for replication
- Creating databases with different configurations
- Generating database auth tokens for application access

## Prerequisites

1. A Turso account - sign up at [app.turso.tech](https://app.turso.tech)
2. Your Turso API token and organization slug

## Setup

1. Install dependencies:

```bash
bun install
```

2. Set up your environment variables:

```bash
export TURSO_API_TOKEN="your_api_token_here"
export TURSO_ORGANIZATION_SLUG="your_org_slug_here"
```

Or create a `.env` file:

```env
TURSO_API_TOKEN=your_api_token_here
TURSO_ORGANIZATION_SLUG=your_org_slug_here
```

## Run

Deploy the infrastructure:

```bash
bun alchemy.run.ts
```

This will create:
- An API token for programmatic access
- A database group with specific location settings
- Multiple databases with authentication tokens
- Output the connection details for your applications

## Clean Up

To destroy all created resources:

```bash
bun alchemy.run.ts --destroy
```

## What's Created

- **API Token**: For managing Turso resources programmatically
- **Database Group**: Defines replication locations and primary region
- **Databases**: SQLite databases distributed according to the group configuration
- **Auth Tokens**: For connecting applications to the databases

The output will include connection URLs and authentication tokens you can use in your applications.