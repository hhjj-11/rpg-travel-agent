import type { FastifyReply, FastifyRequest } from "fastify";
import { GameStateService } from "../services/game-state.service.js";
import { resolveUserId } from "./request-context.js";

const gameStateService = new GameStateService();

export async function getJournalHistory(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  await reply.send(await gameStateService.getJournalHistory(resolveUserId(request)));
}
