/// <reference types="@types/node" />

import alchemy from "alchemy";
import {
  ApiToken,
  Database,
  DatabaseAuthToken,
  Group,
  GroupAuthToken,
} from "alchemy/turso";

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

const groupToken = await GroupAuthToken("test-group-token", {
  group,
});

console.log(groupToken);

const database = await Database("test-database", {
  name: "test-database",
  group,
});

console.log(database);

const databaseToken = await DatabaseAuthToken("test-database-token", {
  database,
});

console.log(databaseToken);

await app.finalize();
