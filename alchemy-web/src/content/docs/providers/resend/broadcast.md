---
title: Broadcast
description: Manage email campaigns sent to audiences
---

# Broadcast

The `ResendBroadcast` resource manages broadcast email campaigns sent to audiences. Broadcasts can be created as drafts, scheduled for later, or sent immediately to specific audiences.

## Example Usage

### Basic Broadcast

Create a draft broadcast:

```ts
import { ResendAudience, ResendBroadcast } from "alchemy/resend";

const audience = await ResendAudience("subscribers", {
  name: "Subscribers"
});

const broadcast = await ResendBroadcast("newsletter", {
  name: "Weekly Newsletter",
  subject: "This Week's Updates",
  from: "news@example.com",
  html: "<h1>Weekly Newsletter</h1><p>Content here...</p>",
  audience: audience
});

console.log(`Broadcast ID: ${broadcast.id}`);
console.log(`Status: ${broadcast.status}`);
```

### Scheduled Broadcast

Create a broadcast scheduled for later:

```ts
const broadcast = await ResendBroadcast("announcement", {
  name: "Product Launch",
  subject: "New Product Launch!",
  from: "marketing@example.com",
  reply_to: "support@example.com",
  html: "<h1>New Product</h1><p>Check out our latest product...</p>",
  text: "New Product\n\nCheck out our latest product...",
  audience: "aud_123456", // Can use audience ID string
  scheduled_at: "2024-12-25T10:00:00Z"
});
```

### Complete Broadcast with All Options

Create a comprehensive broadcast with all available options:

```ts
const audience = await ResendAudience("premium-users", {
  name: "Premium Users"
});

const broadcast = await ResendBroadcast("premium-newsletter", {
  name: "Premium Monthly Newsletter",
  subject: "Exclusive Updates for Premium Members",
  from: "premium@example.com",
  reply_to: "support@example.com",
  html: `
    <html>
      <head><title>Premium Newsletter</title></head>
      <body>
        <h1>Exclusive Updates</h1>
        <p>Thank you for being a premium member!</p>
        <p>Here's what's new this month...</p>
      </body>
    </html>
  `,
  text: `
    Exclusive Updates
    
    Thank you for being a premium member!
    
    Here's what's new this month...
  `,
  audience: audience,
  scheduled_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // Next week
  apiKey: alchemy.secret(process.env.RESEND_API_KEY)
});
```

### Using Domain with Broadcast

Combine verified domain with broadcast:

```ts
import { ResendDomain, ResendAudience, ResendBroadcast } from "alchemy/resend";

const domain = await ResendDomain("company-domain", {
  name: "mail.company.com"
});

const audience = await ResendAudience("customers", {
  name: "Customer List"
});

const broadcast = await ResendBroadcast("company-update", {
  name: "Company Update",
  subject: "Important Company News",
  from: `news@${domain.name}`,
  reply_to: `support@${domain.name}`,
  html: "<h1>Company Update</h1><p>Important news...</p>",
  audience: audience
});
```

## Properties

### Input Properties

- **`name`** (required): Name of the broadcast for identification
- **`subject`** (required): Subject line of the broadcast email
- **`from`** (required): From email address (must be from a verified domain)
- **`audience`** (required): Target audience - can be:
  - Audience ID string (e.g., `"aud_123456"`)
  - `ResendAudience` resource reference
- **`html`** (optional): HTML content of the broadcast
- **`text`** (optional): Plain text content of the broadcast
- **`reply_to`** (optional): Reply-to email address
- **`scheduled_at`** (optional): When to send the broadcast (ISO 8601 format). If not provided, broadcast is created as draft
- **`apiKey`** (optional): API key for authentication. Falls back to `RESEND_API_KEY` environment variable
- **`baseUrl`** (optional): Custom API base URL. Defaults to `"https://api.resend.com"`

### Output Properties

All input properties (except `audience` which becomes `audience_id`), plus:

- **`id`**: The unique identifier for the broadcast
- **`audience_id`**: ID of the target audience
- **`status`**: Current broadcast status (`"draft"`, `"scheduled"`, `"sent"`, `"cancelled"`)
- **`sent_at`**: Timestamp when the broadcast was sent (if applicable)
- **`created_at`**: Timestamp when the broadcast was created

## Broadcast Status

Broadcasts can have different statuses:

- **`draft`**: Created but not scheduled or sent
- **`scheduled`**: Scheduled for future sending
- **`sent`**: Successfully sent to the audience
- **`cancelled`**: Cancelled before sending

## Scheduling Broadcasts

### Schedule for Specific Time

```ts
// Schedule for Christmas morning
const holidayBroadcast = await ResendBroadcast("holiday-greetings", {
  name: "Holiday Greetings",
  subject: "Happy Holidays!",
  from: "greetings@example.com",
  html: "<h1>Happy Holidays!</h1><p>Wishing you joy...</p>",
  audience: audience,
  scheduled_at: "2024-12-25T09:00:00Z"
});
```

### Schedule Relative to Current Time

```ts
// Schedule for next Monday at 10 AM
const nextMonday = new Date();
nextMonday.setDate(nextMonday.getDate() + (1 + 7 - nextMonday.getDay()) % 7);
nextMonday.setHours(10, 0, 0, 0);

const weeklyUpdate = await ResendBroadcast("weekly-update", {
  name: "Weekly Update",
  subject: "This Week in Review",
  from: "updates@example.com",
  html: "<h1>Weekly Update</h1><p>Week summary...</p>",
  audience: audience,
  scheduled_at: nextMonday.toISOString()
});
```

## Content Best Practices

### HTML and Text Content

Always provide both HTML and text content for better deliverability:

```ts
const broadcast = await ResendBroadcast("accessible-newsletter", {
  name: "Accessible Newsletter",
  subject: "Newsletter with Great Accessibility",
  from: "newsletter@example.com",
  html: `
    <h1>Newsletter Title</h1>
    <p>This is the HTML version with <strong>formatting</strong>.</p>
    <a href="https://example.com">Visit our website</a>
  `,
  text: `
    Newsletter Title
    
    This is the plain text version with formatting.
    
    Visit our website: https://example.com
  `,
  audience: audience
});
```

### Personalization Placeholder

```ts
const personalizedBroadcast = await ResendBroadcast("personalized-welcome", {
  name: "Personalized Welcome",
  subject: "Welcome to Our Service!",
  from: "welcome@example.com",
  html: `
    <h1>Welcome {{first_name}}!</h1>
    <p>Thank you for joining us, {{first_name}}.</p>
    <p>Your account email: {{email}}</p>
  `,
  text: `
    Welcome {{first_name}}!
    
    Thank you for joining us, {{first_name}}.
    Your account email: {{email}}
  `,
  audience: audience
});
```

## Updating Broadcasts

You can update broadcast content before it's sent:

```ts
// Initial creation
let broadcast = await ResendBroadcast("draft-newsletter", {
  name: "Draft Newsletter",
  subject: "Draft Subject",
  from: "draft@example.com",
  html: "<h1>Draft Content</h1>",
  audience: audience
});

// Update content
broadcast = await ResendBroadcast("draft-newsletter", {
  name: "Final Newsletter",
  subject: "Final Subject - Newsletter",
  from: "newsletter@example.com",
  html: "<h1>Final Content</h1><p>Ready to send!</p>",
  text: "Final Content\n\nReady to send!",
  audience: audience,
  scheduled_at: new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour from now
});
```

## Important Notes

- **Domain Verification**: The `from` address must be from a verified domain
- **Content Requirements**: At least one of `html` or `text` content is required
- **Scheduling**: Scheduled broadcasts can be updated before the send time
- **Audience Reference**: You can use either audience resource references or ID strings
- **Time Zones**: All timestamps use ISO 8601 format in UTC
- **Delivery**: Resend handles the actual delivery and tracking of broadcasts