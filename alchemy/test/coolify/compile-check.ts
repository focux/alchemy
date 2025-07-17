// Simple compile check for stub implementations
import { Application } from "../../src/coolify/application.ts";
import { Database } from "../../src/coolify/database.ts";
import { Service } from "../../src/coolify/service.ts";
import { Deployment } from "../../src/coolify/deployment.ts";

// This file just checks that the imports compile correctly
const _app = Application;
const _db = Database;
const _svc = Service;
const _dep = Deployment;

export {};