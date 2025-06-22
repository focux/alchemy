import type { AlchemyOptions, Phase } from "alchemy";
import { DOStateStore } from "alchemy/cloudflare";

export default {
  stage: process.env.BRANCH_PREFIX || "prod",
  phase:
    (process.env.ALCHEMY_PHASE as Phase) ??
    (process.argv.includes("--destroy")
      ? "destroy"
      : process.argv.includes("--read")
        ? "read"
        : "up"),
  // pass the password in (you can get it from anywhere, e.g. stdin)
  password: process.env.SECRET_PASSPHRASE,
  quiet: process.argv.includes("--quiet"),
  stateStore:
    process.env.ALCHEMY_STATE_STORE === "cloudflare"
      ? (scope) => new DOStateStore(scope)
      : undefined,
} satisfies AlchemyOptions;
