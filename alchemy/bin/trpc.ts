import { trpcServer } from "trpc-cli";

export const t = trpcServer.initTRPC.create();

const loggingMiddleware = t.middleware(async ({ path, next }) => {
  console.log(`start: ${path}`);
  const start = Date.now();

  try {
    const result = await next();
    const duration = Date.now() - start;
    console.log(`end: ${path} (${duration}ms)`);
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    console.log(`end: ${path} (${duration}ms) - error`);
    throw error;
  }
});

export const loggedProcedure = t.procedure.use(loggingMiddleware);
