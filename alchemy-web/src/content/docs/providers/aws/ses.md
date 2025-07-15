---
title: SES
description: Learn how to configure AWS Simple Email Service (SES) for sending emails using Alchemy in your applications.
---

The SES resource lets you create and manage [Amazon Simple Email Service (SES)](https://docs.aws.amazon.com/ses/latest/dg/Welcome.html) configuration sets and email identities.

## Minimal Example

Create a basic configuration set for sending emails:

```ts
import { SES } from "alchemy/aws";

const configSet = await SES("email-config", {
  configurationSetName: "my-email-config",
  sendingOptions: {
    SendingEnabled: true,
  },
});
```

## Create Domain Identity with DKIM

Create and verify a domain identity with DKIM signing enabled:

```ts
const domainIdentity = await SES("domain-identity", {
  emailIdentity: "example.com",
  enableDkim: true,
  tags: {
    Environment: "production",
  },
});
```

## Configure Tracking Options

Set up tracking options for open and click tracking:

```ts
const emailConfig = await SES("tracking-config", {
  configurationSetName: "tracking-config",
  trackingOptions: {
    CustomRedirectDomain: "click.example.com",
  },
  suppressionOptions: {
    SuppressedReasons: ["BOUNCE", "COMPLAINT"],
  },
});
```

## Complete Example with Domain Verification

For a complete setup including domain verification with DNS automation:

```ts
import { SESVerification } from "alchemy/aws";

// Automate domain verification using Cloudflare DNS
const verification = await SESVerification("example.com-verification", {
  domain: "example.com",
  enableDkim: true,
  enableReceiving: true,
  apiToken: process.env.CLOUDFLARE_API_TOKEN,
});

// Create SES configuration set
const configSet = await SES("production-config", {
  configurationSetName: "production-emails",
  sendingOptions: {
    SendingEnabled: true,
  },
  trackingOptions: {
    CustomRedirectDomain: "click.example.com",
  },
});

console.log(`Domain ${verification.domain} verified: ${verification.verified}`);
console.log(`Email identity ARN: ${verification.emailIdentityArn}`);
```

## Related Resources

- [SES Verification](/providers/aws/ses-verification) - Automate domain verification with Cloudflare DNS
