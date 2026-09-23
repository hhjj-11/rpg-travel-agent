import type { FastifyInstance } from "fastify";
import {
  completeCommission,
  generateCommission,
  interpretCommission,
  locationSync,
  questBoard
} from "../controllers/action.controller.js";

export async function actionRoutes(app: FastifyInstance): Promise<void> {
  app.post("/action/location-sync", locationSync);
  app.post("/action/quest-board", questBoard);
  app.post("/action/commission/interpret", interpretCommission);
  app.post("/action/commission/generate", generateCommission);
  app.post("/action/commission/complete", completeCommission);
}
