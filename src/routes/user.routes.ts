import type { FastifyInstance } from "fastify";
import { getUserProfile } from "../controllers/user.controller.js";

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.get("/user/profile", getUserProfile);
}
