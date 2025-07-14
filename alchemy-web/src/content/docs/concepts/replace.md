---
title: Replace
description: Learn how to safely replace infrastructure resources with Alchemy. Understand the risks and best practices for resource replacement.
sidebar:
  order: 10
---

# Replace

It is some times impossible to UPDATE a resource, e.g. you cannot rename a R2 Bucket name.
In these cases, you need to perform a REPLACE operation to:

1. create a new version of the Resource and update references
2. delete the old version of the Resource (or leave it orphaned)

## Trigger Replacement

During the **update phase**, you can trigger a replacement by calling `await this.replace()`:

```typescript
// Implementation pattern
if (this.phase === "update") {
  if (this.output.name !== props.name) {
    // trigger replace and terminate this `"update"` phase
    await this.replace();
    // (unreachable code)
  } else {
    return updateResource();
  }
}
```

### Create new

After you call `await this.replace()`, the `"update"` phase will terminate and be re-invoked with `"create"` (to create the new resource).

```ts
if (this.phase === "create") {
  return createNewResource();
}
```

### Delete old

After all downstream dependencies have been updated and you finally call `app.finalize()`, Alchemy will then invoke the `"delete"` phase on the old resource.

```ts
const app = await alchemy("app");

// ... create resources

await app.finalize(); // finalize scopes by deleting "orphaned" and "replaced" resources
```

## Immediate replacement

It is sometimes required to destory the old resource before creating the one, e.g. when updating a resource that requires a unique name.

To address this you can trigger a replacement immediately by calling `await this.replace(true)`. This will destroy the old resource before creating the new one.

```ts
await this.replace(true);
```

:::tip
`replace(true)` can cause downtime since a resource is deleted before the new one is create. Downtime can be avoided by a random string to the end of the resource name on the handler level.

```
  async function (this, _id, props) {
    const nameSlug = this.isReplacement
      ? generateSlug()
      : (this.output?.nameSlug ?? generateSlug());
    const name = `${props.name}-${nameSlug}`;

    if (this.phase === "update") {
      if (this.output?.name === name) {
        await this.replace();
      }
    }

    return this({
        nameSlug,
        ...props,
        name,
    })
  }
```
:::