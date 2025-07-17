import { beforeAll, describe, expect } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import {
  Service,
  createService,
  getService,
  listServices,
  deleteService,
  updateService,
  type ServiceData,
} from "../../src/coolify/service.ts";
import { Server } from "../../src/coolify/server.ts";
import { PrivateKey } from "../../src/coolify/private-key.ts";
import { Project } from "../../src/coolify/project.ts";
import { Team } from "../../src/coolify/team.ts";
import { createCoolifyClient, isCoolifyNotFoundError } from "../../src/coolify/client.ts";
import { destroy } from "../../src/destroy.ts";
import { BRANCH_PREFIX } from "../util.ts";

// Skip tests if Coolify is not configured
const SKIP_TESTS = !process.env.COOLIFY_URL || !process.env.COOLIFY_API_TOKEN;

import "../../src/test/vitest.ts";

const test = alchemy.test(import.meta, {
  prefix: BRANCH_PREFIX,
});

describe.skipIf(SKIP_TESTS)("Service", () => {
  let api: ReturnType<typeof createCoolifyClient>;

  beforeAll(() => {
    if (!SKIP_TESTS) {
      api = createCoolifyClient();
    }
  });

  test("Create Predefined Service", async (scope) => {
    const serviceId = `${BRANCH_PREFIX}-service-predefined`;
    let service: Service;
    let sshKey: PrivateKey;
    let server: Server;
    let team: Team;
    let project: Project;

    try {
      // Create dependencies
      sshKey = await PrivateKey(`${BRANCH_PREFIX}-service-key-1`, {
        name: `${BRANCH_PREFIX}-service-key-1`,
        privateKey: process.env.TEST_SSH_PRIVATE_KEY || generateTestKey(),
      });

      server = await Server(`${BRANCH_PREFIX}-service-server-1`, {
        name: `${BRANCH_PREFIX}-service-server-1`,
        ip: "192.168.1.200",
        privateKey: sshKey,
        instantValidate: false,
      });

      team = await Team(`${BRANCH_PREFIX}-service-team-1`, {
        name: "Default Team",
        adopt: true,
      });

      project = await Project(`${BRANCH_PREFIX}-service-project-1`, {
        name: `${BRANCH_PREFIX}-service-project-1`,
        description: "Test project for services",
        team: team,
      });

      // Create a predefined service (Plausible Analytics)
      service = await Service(serviceId, {
        name: `${BRANCH_PREFIX}-plausible`,
        type: "plausible",
        server: server,
        project: project,
        environment: "production",
        environmentVariables: {
          BASE_URL: "https://analytics.example.com",
          SECRET_KEY_BASE: "test-secret-key",
        },
        domains: {
          plausible: ["analytics.example.com"],
        },
      });

      // Verify service creation
      expect(service.serviceId).toMatch(/^[a-f0-9-]{36}$/);
      expect(service.serviceName).toBe(`${BRANCH_PREFIX}-plausible`);
      expect(service.type).toBe("plausible");
      expect(service.status).toBeDefined();

      // Verify via API
      const serviceData = await getService(api, { uuid: service.serviceId });
      expect(serviceData.name).toBe(`${BRANCH_PREFIX}-plausible`);
      expect(serviceData.type).toBe("plausible");
    } finally {
      await destroy(scope);
      if (service) {
        await assertServiceDoesNotExist(api, service);
      }
    }
  });

  test("Create Custom Docker Compose Service", async (scope) => {
    const serviceId = `${BRANCH_PREFIX}-service-custom`;
    let service: Service;
    let sshKey: PrivateKey;
    let server: Server;
    let team: Team;
    let project: Project;

    try {
      // Create dependencies
      sshKey = await PrivateKey(`${BRANCH_PREFIX}-service-key-2`, {
        name: `${BRANCH_PREFIX}-service-key-2`,
        privateKey: process.env.TEST_SSH_PRIVATE_KEY || generateTestKey(),
      });

      server = await Server(`${BRANCH_PREFIX}-service-server-2`, {
        name: `${BRANCH_PREFIX}-service-server-2`,
        ip: "192.168.1.201",
        privateKey: sshKey,
        instantValidate: false,
      });

      team = await Team(`${BRANCH_PREFIX}-service-team-2`, {
        name: "Default Team",
        adopt: true,
      });

      project = await Project(`${BRANCH_PREFIX}-service-project-2`, {
        name: `${BRANCH_PREFIX}-service-project-2`,
        description: "Test project for custom services",
        team: team,
      });

      // Create a custom Docker Compose service
      const dockerComposeYaml = `
version: '3.8'
services:
  web:
    image: nginx:alpine
    ports:
      - "80:80"
    environment:
      - NGINX_HOST=example.com
  api:
    image: node:18-alpine
    command: node server.js
    environment:
      - NODE_ENV=production
      - PORT=3000
`;

      service = await Service(serviceId, {
        name: `${BRANCH_PREFIX}-custom-stack`,
        type: "custom",
        server: server,
        project: project,
        environment: "staging",
        dockerComposeRaw: dockerComposeYaml,
        environmentVariables: {
          API_KEY: "xyz123",
          DEBUG: "false",
        },
        domains: {
          web: ["www.example.com", "example.com"],
          api: ["api.example.com"],
        },
      });

      // Verify service creation
      expect(service.serviceId).toMatch(/^[a-f0-9-]{36}$/);
      expect(service.serviceName).toBe(`${BRANCH_PREFIX}-custom-stack`);
      expect(service.type).toBe("custom");
      expect(service.services).toBeDefined();

      // Verify via API
      const serviceData = await getService(api, { uuid: service.serviceId });
      expect(serviceData.name).toBe(`${BRANCH_PREFIX}-custom-stack`);
      expect(serviceData.type).toBe("custom");
      expect(serviceData.docker_compose_raw).toContain("nginx:alpine");
    } finally {
      await destroy(scope);
      if (service) {
        await assertServiceDoesNotExist(api, service);
      }
    }
  });

  test("Adopt Existing Service", async (scope) => {
    const serviceId = `${BRANCH_PREFIX}-service-adopt`;
    let service1: Service;
    let service2: Service;
    let sshKey: PrivateKey;
    let server: Server;
    let team: Team;
    let project: Project;

    try {
      // Create dependencies
      sshKey = await PrivateKey(`${BRANCH_PREFIX}-service-key-3`, {
        name: `${BRANCH_PREFIX}-service-key-3`,
        privateKey: process.env.TEST_SSH_PRIVATE_KEY || generateTestKey(),
      });

      server = await Server(`${BRANCH_PREFIX}-service-server-3`, {
        name: `${BRANCH_PREFIX}-service-server-3`,
        ip: "192.168.1.202",
        privateKey: sshKey,
        instantValidate: false,
      });

      team = await Team(`${BRANCH_PREFIX}-service-team-3`, {
        name: "Default Team",
        adopt: true,
      });

      project = await Project(`${BRANCH_PREFIX}-service-project-3`, {
        name: `${BRANCH_PREFIX}-service-project-3`,
        description: "Test project for service adoption",
        team: team,
      });

      // Create initial service
      service1 = await Service(serviceId, {
        name: `${BRANCH_PREFIX}-umami`,
        type: "umami",
        server: server,
        project: project,
        environment: "production",
      });

      // Adopt the existing service
      service2 = await Service(`${serviceId}-adopted`, {
        name: `${BRANCH_PREFIX}-umami`,
        type: "umami",
        server: server,
        project: project,
        environment: "production",
        adopt: true,
        environmentVariables: {
          CUSTOM_VAR: "adopted-value",
        },
      });

      // Verify adoption
      expect(service2.serviceId).toBe(service1.serviceId);
      expect(service2.serviceName).toBe(service1.serviceName);
    } finally {
      await destroy(scope);
      if (service1 || service2) {
        await assertServiceDoesNotExist(api, service1 || service2);
      }
    }
  });

  test("Update Service Environment Variables", async (scope) => {
    const serviceId = `${BRANCH_PREFIX}-service-update-env`;
    let service: Service;
    let sshKey: PrivateKey;
    let server: Server;
    let team: Team;
    let project: Project;

    try {
      // Create dependencies
      sshKey = await PrivateKey(`${BRANCH_PREFIX}-service-key-4`, {
        name: `${BRANCH_PREFIX}-service-key-4`,
        privateKey: process.env.TEST_SSH_PRIVATE_KEY || generateTestKey(),
      });

      server = await Server(`${BRANCH_PREFIX}-service-server-4`, {
        name: `${BRANCH_PREFIX}-service-server-4`,
        ip: "192.168.1.203",
        privateKey: sshKey,
        instantValidate: false,
      });

      team = await Team(`${BRANCH_PREFIX}-service-team-4`, {
        name: "Default Team",
        adopt: true,
      });

      project = await Project(`${BRANCH_PREFIX}-service-project-4`, {
        name: `${BRANCH_PREFIX}-service-project-4`,
        description: "Test project for service updates",
        team: team,
      });

      // Create service with initial env vars
      service = await Service(serviceId, {
        name: `${BRANCH_PREFIX}-service-env-test`,
        type: "custom",
        server: server,
        project: project,
        environment: "production",
        dockerComposeRaw: "version: '3.8'\nservices:\n  app:\n    image: alpine:latest",
        environmentVariables: {
          OLD_VAR: "old-value",
          KEEP_VAR: "keep-value",
        },
      });

      // Update environment variables
      const updatedService = await Service(serviceId, {
        name: `${BRANCH_PREFIX}-service-env-test`,
        type: "custom",
        server: server,
        project: project,
        environment: "production",
        dockerComposeRaw: "version: '3.8'\nservices:\n  app:\n    image: alpine:latest",
        environmentVariables: {
          NEW_VAR: "new-value",
          KEEP_VAR: "keep-value",
          UPDATED_VAR: "updated-value",
        },
      });

      // Verify update
      expect(updatedService.serviceId).toBe(service.serviceId);
      
      // Note: Environment variable updates are handled separately through the envs API
      // This test verifies the service can be updated without errors
    } finally {
      await destroy(scope);
      if (service) {
        await assertServiceDoesNotExist(api, service);
      }
    }
  });

  test("Update Service Type (Special Case)", async (scope) => {
    const serviceId = `${BRANCH_PREFIX}-service-type-change`;
    let service1: Service;
    let service2: Service;
    let sshKey: PrivateKey;
    let server: Server;
    let team: Team;
    let project: Project;

    try {
      // Create dependencies
      sshKey = await PrivateKey(`${BRANCH_PREFIX}-service-key-5`, {
        name: `${BRANCH_PREFIX}-service-key-5`,
        privateKey: process.env.TEST_SSH_PRIVATE_KEY || generateTestKey(),
      });

      server = await Server(`${BRANCH_PREFIX}-service-server-5`, {
        name: `${BRANCH_PREFIX}-service-server-5`,
        ip: "192.168.1.204",
        privateKey: sshKey,
        instantValidate: false,
      });

      team = await Team(`${BRANCH_PREFIX}-service-team-5`, {
        name: "Default Team",
        adopt: true,
      });

      project = await Project(`${BRANCH_PREFIX}-service-project-5`, {
        name: `${BRANCH_PREFIX}-service-project-5`,
        description: "Test project for service type change",
        team: team,
      });

      // Create a predefined service
      service1 = await Service(serviceId, {
        name: `${BRANCH_PREFIX}-type-change`,
        type: "plausible",
        server: server,
        project: project,
        environment: "production",
      });

      // Try to change to custom type (this may require replacement)
      service2 = await Service(serviceId, {
        name: `${BRANCH_PREFIX}-type-change`,
        type: "custom",
        server: server,
        project: project,
        environment: "production",
        dockerComposeRaw: "version: '3.8'\nservices:\n  app:\n    image: alpine:latest",
      });

      // Verify the service was replaced or updated
      expect(service2.serviceId).toBeDefined();
      expect(service2.type).toBe("custom");
    } finally {
      await destroy(scope);
      if (service1 || service2) {
        await assertServiceDoesNotExist(api, service2 || service1);
      }
    }
  });

  test("Delete Service", async (scope) => {
    const serviceId = `${BRANCH_PREFIX}-service-delete`;
    let service: Service;
    let sshKey: PrivateKey;
    let server: Server;
    let team: Team;
    let project: Project;

    try {
      // Create dependencies
      sshKey = await PrivateKey(`${BRANCH_PREFIX}-service-key-6`, {
        name: `${BRANCH_PREFIX}-service-key-6`,
        privateKey: process.env.TEST_SSH_PRIVATE_KEY || generateTestKey(),
      });

      server = await Server(`${BRANCH_PREFIX}-service-server-6`, {
        name: `${BRANCH_PREFIX}-service-server-6`,
        ip: "192.168.1.205",
        privateKey: sshKey,
        instantValidate: false,
      });

      team = await Team(`${BRANCH_PREFIX}-service-team-6`, {
        name: "Default Team",
        adopt: true,
      });

      project = await Project(`${BRANCH_PREFIX}-service-project-6`, {
        name: `${BRANCH_PREFIX}-service-project-6`,
        description: "Test project for service deletion",
        team: team,
      });

      // Create service
      service = await Service(serviceId, {
        name: `${BRANCH_PREFIX}-service-to-delete`,
        type: "umami",
        server: server,
        project: project,
        environment: "production",
      });

      // Verify creation
      const created = await getService(api, { uuid: service.serviceId });
      expect(created.uuid).toBe(service.serviceId);

      // Delete service
      await destroy(scope);

      // Verify deletion
      await assertServiceDoesNotExist(api, service);
    } finally {
      // Cleanup already done
    }
  });

  // Additional test cases

  test("Create Umami Analytics Service", async (scope) => {
    const serviceId = `${BRANCH_PREFIX}-service-umami`;
    let service: Service;
    let sshKey: PrivateKey;
    let server: Server;
    let team: Team;
    let project: Project;

    try {
      // Create dependencies
      sshKey = await PrivateKey(`${BRANCH_PREFIX}-service-key-7`, {
        name: `${BRANCH_PREFIX}-service-key-7`,
        privateKey: process.env.TEST_SSH_PRIVATE_KEY || generateTestKey(),
      });

      server = await Server(`${BRANCH_PREFIX}-service-server-7`, {
        name: `${BRANCH_PREFIX}-service-server-7`,
        ip: "192.168.1.206",
        privateKey: sshKey,
        instantValidate: false,
      });

      team = await Team(`${BRANCH_PREFIX}-service-team-7`, {
        name: "Default Team",
        adopt: true,
      });

      project = await Project(`${BRANCH_PREFIX}-service-project-7`, {
        name: `${BRANCH_PREFIX}-service-project-7`,
        description: "Test project for Umami",
        team: team,
      });

      // Create Umami service
      service = await Service(serviceId, {
        name: `${BRANCH_PREFIX}-umami-analytics`,
        type: "umami",
        server: server,
        project: project,
        environment: "production",
        domains: {
          umami: ["umami.example.com"],
        },
      });

      // Verify service creation
      expect(service.serviceId).toMatch(/^[a-f0-9-]{36}$/);
      expect(service.serviceName).toBe(`${BRANCH_PREFIX}-umami-analytics`);
      expect(service.type).toBe("umami");
    } finally {
      await destroy(scope);
      if (service) {
        await assertServiceDoesNotExist(api, service);
      }
    }
  });

  test("List Services", async (scope) => {
    const serviceId = `${BRANCH_PREFIX}-service-list`;
    let service: Service;
    let sshKey: PrivateKey;
    let server: Server;
    let team: Team;
    let project: Project;

    try {
      // Create dependencies
      sshKey = await PrivateKey(`${BRANCH_PREFIX}-service-key-8`, {
        name: `${BRANCH_PREFIX}-service-key-8`,
        privateKey: process.env.TEST_SSH_PRIVATE_KEY || generateTestKey(),
      });

      server = await Server(`${BRANCH_PREFIX}-service-server-8`, {
        name: `${BRANCH_PREFIX}-service-server-8`,
        ip: "192.168.1.207",
        privateKey: sshKey,
        instantValidate: false,
      });

      team = await Team(`${BRANCH_PREFIX}-service-team-8`, {
        name: "Default Team",
        adopt: true,
      });

      project = await Project(`${BRANCH_PREFIX}-service-project-8`, {
        name: `${BRANCH_PREFIX}-service-project-8`,
        description: "Test project for listing services",
        team: team,
      });

      // Create service
      service = await Service(serviceId, {
        name: `${BRANCH_PREFIX}-service-list-test`,
        type: "plausible",
        server: server,
        project: project,
        environment: "production",
      });

      // List services
      const { data: services } = await listServices(api);
      
      // Verify our service is in the list
      const found = services.some((s: ServiceData) => s.uuid === service.serviceId);
      expect(found).toBe(true);
    } finally {
      await destroy(scope);
      if (service) {
        await assertServiceDoesNotExist(api, service);
      }
    }
  });

  test("Service with Complex Docker Compose", async (scope) => {
    const serviceId = `${BRANCH_PREFIX}-service-complex`;
    let service: Service;
    let sshKey: PrivateKey;
    let server: Server;
    let team: Team;
    let project: Project;

    try {
      // Create dependencies
      sshKey = await PrivateKey(`${BRANCH_PREFIX}-service-key-9`, {
        name: `${BRANCH_PREFIX}-service-key-9`,
        privateKey: process.env.TEST_SSH_PRIVATE_KEY || generateTestKey(),
      });

      server = await Server(`${BRANCH_PREFIX}-service-server-9`, {
        name: `${BRANCH_PREFIX}-service-server-9`,
        ip: "192.168.1.208",
        privateKey: sshKey,
        instantValidate: false,
      });

      team = await Team(`${BRANCH_PREFIX}-service-team-9`, {
        name: "Default Team",
        adopt: true,
      });

      project = await Project(`${BRANCH_PREFIX}-service-project-9`, {
        name: `${BRANCH_PREFIX}-service-project-9`,
        description: "Test project for complex services",
        team: team,
      });

      // Create a complex Docker Compose service
      const complexDockerCompose = `
version: '3.8'

services:
  frontend:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./html:/usr/share/nginx/html
    depends_on:
      - backend
    networks:
      - app-network

  backend:
    image: node:18-alpine
    command: node server.js
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgres://user:pass@database:5432/app
    ports:
      - "3000:3000"
    depends_on:
      - database
    networks:
      - app-network

  database:
    image: postgres:15-alpine
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=app
    volumes:
      - postgres-data:/var/lib/postgresql/data
    networks:
      - app-network

volumes:
  postgres-data:

networks:
  app-network:
    driver: bridge
`;

      service = await Service(serviceId, {
        name: `${BRANCH_PREFIX}-complex-stack`,
        type: "custom",
        server: server,
        project: project,
        environment: "production",
        dockerComposeRaw: complexDockerCompose,
        domains: {
          frontend: ["app.example.com"],
          backend: ["api.example.com"],
        },
        secrets: {
          DATABASE_PASSWORD: "super-secret-password",
        },
      });

      // Verify service creation
      expect(service.serviceId).toMatch(/^[a-f0-9-]{36}$/);
      expect(service.serviceName).toBe(`${BRANCH_PREFIX}-complex-stack`);
      expect(service.services).toBeDefined();
    } finally {
      await destroy(scope);
      if (service) {
        await assertServiceDoesNotExist(api, service);
      }
    }
  });
});

async function assertServiceDoesNotExist(
  api: ReturnType<typeof createCoolifyClient>,
  service: Service,
): Promise<void> {
  try {
    await getService(api, { uuid: service.serviceId });
    throw new Error(`Service ${service.serviceId} still exists`);
  } catch (error) {
    if (!isCoolifyNotFoundError(error)) {
      throw error;
    }
    // Service properly deleted
  }
}

function generateTestKey(): string {
  // This is a test key - DO NOT use in production
  return `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA7VJJKQiLvtcpASgKnz6HdPPSVGyjMY8h9Ez7QdopYtzCG7tj
r6xjsQVQ1uc0UYLPPAdpPqaLOxIjpJJIrqBEO0v0FEr3zDWn0zFhH+Zd0WYY7dKR
VzLFQ2HuN6s4kNdLpGPgPKZdJEW/0V7bQY7VhFR1gCmT0B3Qp5I/OB5K8DpGOiQW
bGcDf3KQElLspVbQPdjGNJIzCfBTrD9jqNX8F8f5EvGQVHfIKcEWzrWNnI4nFyeU
-----END RSA PRIVATE KEY-----`;
}