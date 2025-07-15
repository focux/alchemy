---
title: SES Verification
description: Automate AWS SES domain verification using Cloudflare DNS with the SESVerification resource.
---

The SESVerification resource automates the complete process of verifying an AWS SES domain identity using Cloudflare DNS. This resource handles the 7-step verification workflow including DNS record creation, DKIM setup, and verification polling.

## Key Features

- **Automated DNS Record Creation**: Creates required TXT record for domain verification
- **DKIM Support**: Optionally creates 3 CNAME records for DKIM signing
- **MX Record Support**: Optionally creates MX record for email receiving
- **Verification Polling**: Continuously monitors verification status until completion
- **Cloudflare Integration**: Uses existing Zone and DnsRecords resources
- **Error Handling**: Comprehensive error handling and logging

## Basic Domain Verification

Verify a domain for sending emails through AWS SES:

```ts
import { SESVerification } from "alchemy/aws";

const verification = await SESVerification("example.com-ses", {
  domain: "example.com",
  apiToken: process.env.CLOUDFLARE_API_TOKEN
});

console.log(`Domain ${verification.domain} verification status: ${verification.verificationStatus}`);
console.log(`Verified: ${verification.verified}`);
```

## Complete Setup with DKIM and Receiving

Set up domain verification with DKIM signing and email receiving:

```ts
const verification = await SESVerification("example.com-ses", {
  domain: "example.com",
  enableDkim: true,
  enableReceiving: true,
  region: "us-east-1",
  apiToken: process.env.CLOUDFLARE_API_TOKEN
});

console.log(`Domain: ${verification.domain}`);
console.log(`Domain verification: ${verification.verificationStatus}`);
console.log(`DKIM status: ${verification.dkimStatus}`);
console.log(`DNS records created:`, verification.dnsRecords);
```

## Custom Verification Settings

Configure custom timeout and polling intervals:

```ts
const verification = await SESVerification("example.com-ses", {
  domain: "example.com",
  enableDkim: true,
  verificationTimeout: 600000, // 10 minutes
  pollingInterval: 15000, // 15 seconds
  apiToken: process.env.CLOUDFLARE_API_TOKEN
});
```

## Using with Cloudflare Zone Resource

Integrate with existing Cloudflare Zone resource:

```ts
import { Zone } from "alchemy/cloudflare";
import { SESVerification } from "alchemy/aws";

const zone = await Zone("example.com-zone", {
  zone: "example.com",
  apiToken: process.env.CLOUDFLARE_API_TOKEN
});

const verification = await SESVerification("example.com-ses", {
  domain: "example.com",
  enableDkim: true,
  enableReceiving: true,
  apiToken: process.env.CLOUDFLARE_API_TOKEN
});
```

## Configuration Options

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| `domain` | `string` | The domain to verify with AWS SES | Required |
| `enableDkim` | `boolean` | Whether to enable DKIM signing | `false` |
| `enableReceiving` | `boolean` | Whether to create MX records for receiving | `false` |
| `region` | `string` | AWS region for SES email receiving | `"us-east-1"` |
| `verificationTimeout` | `number` | Max time to wait for verification (ms) | `300000` (5 min) |
| `pollingInterval` | `number` | Polling interval for verification (ms) | `30000` (30 sec) |
| `apiToken` | `string` | Cloudflare API token | Required |
| `accountId` | `string` | Cloudflare account ID | Optional |
| `tags` | `Record<string, string>` | Tags for DNS records | Optional |

## Output Properties

The resource returns the following properties:

```ts
interface SESVerification {
  domain: string;                    // The domain being verified
  emailIdentityArn: string;          // AWS SES email identity ARN
  verificationStatus: string;        // Domain verification status
  dkimStatus?: string;               // DKIM verification status (if enabled)
  dkimTokens?: string[];             // DKIM tokens for manual verification
  dnsRecords: {
    domainVerificationRecord: string; // TXT record for domain verification
    dkimRecords?: string[];           // CNAME records for DKIM
    mxRecord?: string;                // MX record for receiving
  };
  zoneId: string;                    // Cloudflare zone ID
  verified: boolean;                 // Whether verification completed
}
```

## DNS Records Created

The resource creates the following DNS records in Cloudflare:

### Domain Verification Record
- **Name**: `_amazonses.example.com`
- **Type**: `TXT`
- **Content**: AWS-provided verification token
- **TTL**: 300 seconds

### DKIM Records (if enabled)
- **Name**: `{token}._domainkey.example.com`
- **Type**: `CNAME`
- **Content**: `{token}.dkim.amazonses.com`
- **TTL**: 300 seconds

### MX Record (if receiving enabled)
- **Name**: `example.com`
- **Type**: `MX`
- **Content**: `inbound-smtp.{region}.amazonaws.com`
- **Priority**: 10
- **TTL**: 300 seconds

## Prerequisites

1. **AWS SES Access**: Ensure your AWS credentials have SES permissions
2. **Cloudflare Zone**: The domain must be managed by Cloudflare
3. **Cloudflare API Token**: Token with Zone:Edit permissions

## Error Handling

The resource handles common scenarios:

- **Domain not in Cloudflare**: Throws error if domain zone not found
- **AWS API Errors**: Retries transient AWS API failures
- **Verification Timeout**: Logs warning if verification doesn't complete within timeout
- **DNS Creation Failures**: Propagates Cloudflare DNS record creation errors

## Best Practices

1. **Use Environment Variables**: Store API tokens in environment variables
2. **Enable DKIM**: Always enable DKIM for better deliverability
3. **Monitor Verification**: Check the `verified` property to ensure completion
4. **Appropriate Timeouts**: Adjust timeout based on your requirements
5. **Error Handling**: Implement proper error handling for production use

## Related Resources

- [SES](/providers/aws/ses) - Basic SES configuration without verification
- [DnsRecords](/providers/cloudflare/dns-records) - Manual DNS record management
- [Zone](/providers/cloudflare/zone) - Cloudflare zone management