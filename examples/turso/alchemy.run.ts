/// <reference types="@types/node" />

import alchemy from "alchemy";
import { ApiToken, Database, DatabaseAuthToken, Group } from "alchemy/turso";

const app = await alchemy("example-turso");

// Create an API token for programmatic access
const apiToken = await ApiToken("main-token", {
  name: "example-api-token",
});

// Create a multi-region group for global distribution
const globalGroup = await Group("global", {
  locations: ["iad", "lhr"],
  primary: "iad",
});

// Create a production database
const productionDb = await Database("production", {
  group: globalGroup,
  size_limit: "1GB",
});

// Create a database auth token for connecting to the database
const prodAuthToken = await DatabaseAuthToken("prod-token", {
  database: productionDb,
  expiration: "never",
  authorization: "full-access",
});

// Create a development database in the default group
const devDb = await Database("development", {
  group: "default",
});

// Create a development auth token
const devAuthToken = await DatabaseAuthToken("dev-token", {
  database: devDb,
});

// Output connection details
console.log({
  apiToken: apiToken.token,
  production: {
    url: `https://${productionDb.Hostname}`,
    authToken: prodAuthToken.jwt,
  },
  development: {
    url: `https://${devDb.Hostname}`,
    authToken: devAuthToken.jwt,
  },
});

await app.finalize();
