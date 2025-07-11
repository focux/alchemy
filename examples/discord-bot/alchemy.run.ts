import alchemy from "alchemy";
import { Worker } from "alchemy/cloudflare";
import { Application, CommandOptionType, SlashCommand } from "alchemy/discord";

const app = await alchemy("my-discord-bot");

// Get Discord credentials from environment
const botToken = alchemy.secret(process.env.DISCORD_TOKEN!);
const publicKey = process.env.DISCORD_PUBLIC_KEY!;
const applicationId = process.env.DISCORD_APPLICATION_ID!;

// Create the interactions worker first
export const worker = await Worker("discord-interactions", {
  entrypoint: "./src/bot.ts",
  bindings: {
    DISCORD_PUBLIC_KEY: publicKey,
    DISCORD_APPLICATION_ID: applicationId,
    DISCORD_BOT_TOKEN: botToken,
  },
});

// Configure Discord application with the worker URL
const discord = await Application("alchemy-test", {
  name: "alchemy-test",
  description: "A Discord bot powered by Alchemy and Cloudflare Workers",
  botToken,
  interactionsEndpointUrl: worker.url,
  public: false,
});

// Create a ping command
await SlashCommand("ping", {
  application: discord,
  name: "ping",
  description: "Replies with pong!",
});

// Create a hello command with options
await SlashCommand("hello", {
  application: discord,
  name: "hello",
  description: "Say hello to someone",
  options: [
    {
      type: CommandOptionType.STRING,
      name: "name",
      description: "Name to greet",
      required: true,
    },
  ],
});

// Output important information
console.log("\n✅ Bot deployed successfully!");
console.log("\n🤖 Bot invite URL:");
console.log(`   ${discord.inviteUrl}`);
console.log(`\n📡 Worker URL: ${worker.url}`);
console.log(`🆔 Application ID: ${discord.id}`);

await app.finalize();
