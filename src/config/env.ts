import dotenv from "dotenv";

dotenv.config();

export const env = {
  databaseUrl: process.env.DATABASE_URL,
  host: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 3000),
  defaultUserId: process.env.DEFAULT_USER_ID ?? "demo-user",
  activeAgent: {
    questCooldownMs: Number(process.env.LOCATION_QUEST_COOLDOWN_SECONDS ?? 600) * 1000
  },
  ai: {
    apiBaseUrl: process.env.AI_API_BASE_URL ?? "https://ark.cn-beijing.volces.com/api/v3",
    apiKey: process.env.AI_API_KEY,
    model: process.env.AI_MODEL ?? "doubao-seed-1-6-vision-250815",
    responseFormatJson: process.env.AI_RESPONSE_FORMAT_JSON === "true"
  },
  amap: {
    apiBaseUrl: process.env.AMAP_API_BASE_URL ?? "https://restapi.amap.com",
    apiKey: process.env.AMAP_API_KEY
  }
};
