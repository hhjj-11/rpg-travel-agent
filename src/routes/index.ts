import type { FastifyInstance } from "fastify";
import { actionRoutes } from "./action.routes.js";
import { journalRoutes } from "./journal.routes.js";
import { userRoutes } from "./user.routes.js";

export async function apiRoutes(app: FastifyInstance): Promise<void> {
  await app.register(userRoutes);
  await app.register(actionRoutes);
  await app.register(journalRoutes);
}
