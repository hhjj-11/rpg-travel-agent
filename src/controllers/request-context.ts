import type { FastifyRequest } from "fastify";
import { env } from "../config/env.js";

export function resolveUserId(request: FastifyRequest, bodyUserId?: string): string {
  const headerValue = request.headers["x-user-id"];
  const headerUserId = Array.isArray(headerValue) ? headerValue[0] : headerValue;

  return bodyUserId ?? headerUserId ?? env.defaultUserId;
}
