/// <reference types="@types/node" />

import alchemy from "alchemy";
import { Database, Group } from "alchemy/turso";

const app = await alchemy("example-turso");

const group = await Group("test-group", {
  name: "test",
  location: "aws-us-east-1",
  organization: "john-royal",
});

const database = await Database("test-database", {
  name: "test",
  group: group,
  organization: "john-royal",
});

console.log(database);

await app.finalize();
