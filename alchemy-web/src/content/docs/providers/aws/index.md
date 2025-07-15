---
title: AWS
description: Build and deploy applications on Amazon Web Services using Alchemy's AWS provider.
---

# AWS

The AWS provider enables you to create and manage Amazon Web Services resources using Alchemy. This provider supports a wide range of AWS services including compute, storage, databases, messaging, and more.

Official AWS Documentation: [AWS Documentation](https://docs.aws.amazon.com/)

## Resources

- [Bucket](./bucket.md) - S3 bucket for object storage
- [Control](./control.md) - AWS Control Tower and Cloud Formation resources
- [Function](./function.md) - Lambda functions for serverless compute
- [Policy](./policy.md) - IAM policies for access control
- [Policy Attachment](./policy-attachment.md) - Attach policies to IAM roles
- [Queue](./queue.md) - SQS queues for messaging
- [Role](./role.md) - IAM roles for service authentication
- [S3 State Store](./s3-state-store.md) - S3-based state storage for Alchemy
- [SES](./ses.md) - Simple Email Service for sending emails
- [SES Verification](./ses-verification.md) - Automate SES domain verification with Cloudflare DNS
- [Table](./table.md) - DynamoDB tables for NoSQL storage

## Example Usage

```ts
import { Role, Policy, PolicyAttachment, Function, SESVerification } from "alchemy/aws";

// Create IAM role for Lambda function
const lambdaRole = await Role("lambda-role", {
  assumeRolePolicy: {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: {
          Service: "lambda.amazonaws.com",
        },
        Action: "sts:AssumeRole",
      },
    ],
  },
});

// Create custom policy
const customPolicy = await Policy("lambda-policy", {
  policy: {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ],
        Resource: "arn:aws:logs:*:*:*",
      },
    ],
  },
});

// Attach policy to role
const attachment = await PolicyAttachment("lambda-policy-attachment", {
  role: lambdaRole,
  policy: customPolicy,
});

// Create Lambda function
const lambda = await Function("email-handler", {
  runtime: "nodejs20.x",
  handler: "index.handler",
  role: lambdaRole,
  code: {
    zipFile: Buffer.from(`
      exports.handler = async (event) => {
        console.log('Processing email event:', event);
        return { statusCode: 200, body: 'Email processed' };
      };
    `),
  },
});

// Set up SES domain verification
const sesVerification = await SESVerification("example.com-ses", {
  domain: "example.com",
  enableDkim: true,
  enableReceiving: true,
  apiToken: process.env.CLOUDFLARE_API_TOKEN,
});

console.log(`Lambda function: ${lambda.functionName}`);
console.log(`SES domain verified: ${sesVerification.verified}`);
```

## Prerequisites

### AWS Credentials

Configure AWS credentials using one of these methods:

1. **AWS CLI** (recommended):
   ```bash
   aws configure
   ```

2. **Environment Variables**:
   ```bash
   export AWS_ACCESS_KEY_ID=your-access-key
   export AWS_SECRET_ACCESS_KEY=your-secret-key
   export AWS_REGION=us-east-1
   ```

3. **IAM Roles** (for EC2/Lambda/ECS):
   Attach appropriate IAM roles to your compute resources.

### Required Permissions

Ensure your AWS credentials have the necessary permissions for the resources you plan to create. Common permissions include:

- `iam:*` for IAM resources
- `lambda:*` for Lambda functions
- `s3:*` for S3 buckets
- `dynamodb:*` for DynamoDB tables
- `sqs:*` for SQS queues
- `ses:*` for SES resources

### Regional Considerations

Most AWS resources are region-specific. Set the `AWS_REGION` environment variable to your preferred region:

```bash
export AWS_REGION=us-east-1  # or your preferred region
```

## Best Practices

1. **Use IAM Roles**: Prefer IAM roles over access keys for production deployments
2. **Principle of Least Privilege**: Grant only necessary permissions
3. **Resource Tagging**: Use consistent tagging for resource management
4. **Environment Separation**: Use different AWS accounts or regions for different environments
5. **State Management**: Use secure state stores like S3 with versioning enabled