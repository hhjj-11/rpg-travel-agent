import Fastify from "fastify";
import cors from "@fastify/cors";
import { env } from "./config/env.js";
import { testPageHtml } from "./frontend/test-page.js";
import { apiRoutes } from "./routes/index.js";

const app = Fastify({
  logger: true,
  bodyLimit: 10 * 1024 * 1024
});

await app.register(cors, { origin: false });

app.get("/health", async () => {
  return {
    status: "ok",
    service: "rpg-agent-backend",
    mode: env.databaseUrl ? "database-configured" : "mock-without-database"
  };
});

app.get("/", async (_request, reply) => {
  await reply.type("text/html; charset=utf-8").send(testPageHtml);
});

await app.register(apiRoutes, {
  prefix: "/api"
});

try {
  await app.listen({
    host: env.host,
    port: env.port
  });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
