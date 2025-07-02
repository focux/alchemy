/// <reference types="@types/node" />

import alchemy from "alchemy";
import { ApiToken, Database, Group } from "alchemy/turso";

const app = await alchemy("example-turso");

const token = await ApiToken("test-token", {
  name: "test-token",
});

console.log(token);

const group = await Group("test-group", {
  name: "test-group",
  location: "aws-eu-west-1",
});

console.log(group);

const database = await Database("test-database", {
  name: "test-database",
  group,
});

console.log(database);

await app.finalize();
