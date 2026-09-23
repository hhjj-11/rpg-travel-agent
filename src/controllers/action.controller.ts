import type { FastifyReply, FastifyRequest } from "fastify";
import { setTimeout as delay } from "node:timers/promises";
import type {
  CommissionCompleteRequest,
  CommissionGenerateRequest,
  CommissionIntentRequest,
  LocationSyncRequest,
  QuestBoardRequest
} from "../models/api-contracts.js";
import { resolveUserId } from "./request-context.js";
import { CommissionService } from "../services/commission.service.js";
import { TravelAgentService } from "../services/travel-agent.service.js";

const travelAgentService = new TravelAgentService();
const commissionService = new CommissionService();

export async function locationSync(
  request: FastifyRequest<{ Body: LocationSyncRequest }>,
  reply: FastifyReply
): Promise<void> {
  const { latitude, longitude } = request.body ?? {};

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    await reply.code(400).send({
      error: "BAD_REQUEST",
      message: "latitude and longitude must be valid numbers."
    });
    return;
  }

  const userId = resolveUserId(request, request.body.userId);
  const evaluation = await travelAgentService.evaluateLocation(userId, request.body);

  if (evaluation.status === "SAFE") {
    await reply.send(evaluation);
    return;
  }

  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });

  try {
    for await (const event of travelAgentService.streamTriggeredQuest(evaluation)) {
      writeSse(reply, event.event, event.data);
      await delay(160);
    }
  } catch (error) {
    writeSse(reply, "error", {
      message: error instanceof Error ? error.message : "Unknown travel agent error."
    });
  } finally {
    reply.raw.end();
  }
}

export async function questBoard(
  request: FastifyRequest<{ Body: QuestBoardRequest }>,
  reply: FastifyReply
): Promise<void> {
  const { latitude, longitude } = request.body ?? {};

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    await reply.code(400).send({
      error: "BAD_REQUEST",
      message: "latitude and longitude must be valid numbers."
    });
    return;
  }

  const userId = resolveUserId(request, request.body.userId);
  const response = await travelAgentService.generateQuestBoard(userId, request.body);

  await reply.send(response);
}

export async function interpretCommission(
  request: FastifyRequest<{ Body: CommissionIntentRequest }>,
  reply: FastifyReply
): Promise<void> {
  if (!request.body?.text?.trim()) {
    await reply.code(400).send({
      error: "BAD_REQUEST",
      message: "text is required."
    });
    return;
  }

  await reply.send(await commissionService.interpret(request.body.text));
}

export async function generateCommission(
  request: FastifyRequest<{ Body: CommissionGenerateRequest }>,
  reply: FastifyReply
): Promise<void> {
  const { latitude, longitude, scenario } = request.body ?? {};

  if (!scenario || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    await reply.code(400).send({
      error: "BAD_REQUEST",
      message: "scenario, latitude and longitude are required."
    });
    return;
  }

  const userId = resolveUserId(request, request.body.userId);
  await reply.send(await commissionService.generate({ ...request.body, userId }));
}

export async function completeCommission(
  request: FastifyRequest<{ Body: CommissionCompleteRequest }>,
  reply: FastifyReply
): Promise<void> {
  if (!request.body?.commission) {
    await reply.code(400).send({
      error: "BAD_REQUEST",
      message: "commission is required."
    });
    return;
  }

  const userId = resolveUserId(request, request.body.userId);
  await reply.send(await commissionService.complete({ ...request.body, userId }));
}

function writeSse(reply: FastifyReply, event: string, data: unknown): void {
  reply.raw.write(`event: ${event}\n`);
  reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
}
