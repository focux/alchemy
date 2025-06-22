import { GithubProvider } from "@openauthjs/openauth/provider/github";
import { createSubjects } from "@openauthjs/openauth/subject";
import alchemy from "alchemy";
import { OpenAuth } from "alchemy/cloudflare";
import { object, string } from "valibot";

const subjects = createSubjects({
  user: object({
    userID: string(),
  }),
});

export default OpenAuth("auth", import.meta, {
  subjects,
  providers: {
    github: GithubProvider({
      clientID: alchemy.env.GITHUB_CLIENT_ID,
      clientSecret: alchemy.env.GITHUB_CLIENT_SECRET,
      scopes: ["user:email", "read:user"],
    }),
  },
  async success(ctx, value) {
    return ctx.subject("user", {
      userID: (await lookupGithubUser(value.tokenset.access)).id,
    });
  },
});

async function lookupGithubUser(accessToken: string): Promise<{
  id: string;
  email: string;
  name: string;
}> {
  return {
    id: "123",
    email: "test@test.com",
    name: "Test User",
  };
}
