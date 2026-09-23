import type { FastifyInstance } from "fastify";
import { getJournalHistory } from "../controllers/journal.controller.js";

export async function journalRoutes(app: FastifyInstance): Promise<void> {
  app.get("/journal/history", getJournalHistory);
}
