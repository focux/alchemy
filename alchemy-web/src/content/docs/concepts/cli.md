---
title: CLI Arguments
description: Alchemy automatically parses CLI arguments when you run your infrastructure scripts.
---

# CLI Arguments

Alchemy doesn't have a traditional CLI tool like `wrangler` or `terraform`. Instead, it automatically parses CLI arguments when you initialize an alchemy application, making it easy to run your infrastructure scripts with common options.

## Available Arguments

```bash
bun ./alchemy.run.ts                # deploy to cloud
bun ./alchemy.run.ts --destroy      # tear down (destroy all resources)
bun ./alchemy.run.ts --read         # read-only mode
bun ./alchemy.run.ts --stage prod   # deploy to specific stage
bun ./alchemy.run.ts --quiet        # suppress output
bun ./alchemy.run.ts --dev          # local development mode

# local dev & hot redeployment
bun --watch ./alchemy.run.ts        # hot redeployment to cloud
bun --watch ./alchemy.run.ts --dev  # local development with hot redeployment
```

## Environment Variables

- `ALCHEMY_PASSWORD` - Password for encrypting secrets
- `ALCHEMY_STAGE` - Default stage (can be overridden with `--stage`)
- `ALCHEMY_QUIET` - Suppress output (can be overridden with `--quiet`)

## Programmatic Override

Since Alchemy is a TypeScript library, you can override any CLI arguments programmatically. Explicit options always take precedence over CLI arguments:

```typescript
// CLI args are parsed automatically
const app = await alchemy("my-app");

// Override CLI args with explicit options
const app = await alchemy("my-app", {
  phase: "up",        // Overrides --destroy or --read
  stage: "prod",      // Overrides --stage
  quiet: false,       // Overrides --quiet
  password: "secret", // Overrides ALCHEMY_PASSWORD env var
  dev: true,          // Overrides --dev detection
});
```

This design choice keeps Alchemy simple while still providing the convenience of CLI arguments for common operations.