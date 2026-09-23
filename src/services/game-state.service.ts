import type { PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../config/database.js";
import type {
  AchievementSummary,
  ActiveBuff,
  AttributeDelta,
  FoodCodexItem,
  JournalHistoryItem,
  JournalHistoryResponse,
  UserProfileResponse
} from "../models/api-contracts.js";

export class GameStateService {
  constructor(private readonly db: PrismaClient = prisma) {}

  async getUserProfile(userId: string): Promise<UserProfileResponse> {
    if (!env.databaseUrl) {
      return createLocalUserProfile(userId);
    }

    const user = await this.db.user.upsert({
      where: { id: userId },
      update: {},
      create: {
        id: userId,
        username: "Traveler"
      },
      include: {
        achievements: {
          include: { achievement: true }
        }
      }
    });

    const achievements = user.achievements.map((item): AchievementSummary => {
      const buff = readActiveBuff(item.achievement.buff);
      return {
        code: item.achievement.code,
        name: item.achievement.name,
        title: item.achievement.title,
        branch: item.achievement.branch,
        unlockedAt: item.unlockedAt.toISOString(),
        buffActive: item.buffActive,
        buff
      };
    });

    return {
      user: {
        id: user.id,
        username: user.username,
        avatarUrl: user.avatarUrl,
        level: user.level,
        exp: user.exp,
        nextLevelExp: user.level * 500,
        attributes: {
          vitality: user.vitality,
          exploration: user.exploration,
          happiness: user.happiness,
          flavorExperience: user.flavorExperience,
          nutrition: user.nutrition,
          curiosity: user.curiosity,
          baseSerendipity: user.baseSerendipity,
          currentSerendipity: user.currentSerendipity
        }
      },
      achievements,
      activeBuffs: achievements.filter((item) => item.buffActive).map((item) => item.buff)
    };
  }

  async getJournalHistory(userId: string): Promise<JournalHistoryResponse> {
    if (!env.databaseUrl) {
      return createLocalJournalHistory();
    }

    const journals = await this.db.adventureJournal.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50
    });

    const historyItems: JournalHistoryItem[] = journals.map((journal) => ({
      id: journal.id,
      type: journal.type,
      title: journal.title,
      summary: journal.summary ?? "",
      storyText: journal.storyText ?? "",
      createdAt: journal.createdAt.toISOString(),
      attributeDelta: {
        exp: journal.expDelta,
        vitality: journal.vitalityDelta,
        exploration: journal.explorationDelta,
        happiness: journal.happinessDelta,
        flavorExperience: journal.flavorExperienceDelta,
        nutrition: journal.nutritionDelta,
        curiosity: journal.curiosityDelta,
        serendipity: journal.serendipityDelta
      },
      metadata: readMetadata(journal.metadata)
    }));

    return {
      journals: historyItems,
      foodCodex: createFoodCodexFromJournals(journals)
    };
  }
}

function readActiveBuff(value: unknown): ActiveBuff {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return {
      code: readString(record.code, "UNKNOWN_BUFF"),
      name: readString(record.name, "未命名 Buff"),
      description: readString(record.description, ""),
      effects: readEffects(record.effects)
    };
  }

  return {
    code: "UNKNOWN_BUFF",
    name: "未命名 Buff",
    description: "",
    effects: {}
  };
}

function readEffects(value: unknown): Record<string, number | string | boolean> {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter((entry): entry is [string, number | string | boolean] => {
      const item = entry[1];
      return typeof item === "number" || typeof item === "string" || typeof item === "boolean";
    })
  );
}

function createFoodCodexFromJournals(
  journals: Array<{
    id: string;
    foodName: string | null;
    cuisine: string | null;
    spices: string[];
    imageUrl: string | null;
    createdAt: Date;
    metadata: unknown;
  }>
): FoodCodexItem[] {
  const seen = new Set<string>();
  const codex: FoodCodexItem[] = [];

  for (const journal of journals) {
    if (!journal.foodName || seen.has(journal.foodName)) {
      continue;
    }

    seen.add(journal.foodName);
    const metadata = readMetadata(journal.metadata);
    codex.push({
      id: `food-${journal.id}`,
      foodName: journal.foodName,
      cuisine: journal.cuisine ?? "Unknown",
      flavorTags: Array.isArray(metadata.flavorTags) ? metadata.flavorTags.filter(isString) : [],
      detectedSpices: journal.spices,
      imageUrl: journal.imageUrl,
      discoveredAt: journal.createdAt.toISOString()
    });
  }

  return codex;
}

function createLocalUserProfile(userId: string): UserProfileResponse {
  const digestiveBuff: ActiveBuff = {
    code: "DIGESTIVE_IMMUNITY",
    name: "百毒不侵",
    description: "免受饮食不规律导致的消化不良 Debuff 影响。",
    effects: {
      digestiveDebuffImmune: true,
      exoticFlavorHappinessMultiplier: 1.15
    }
  };

  const serendipityBuff: ActiveBuff = {
    code: "SERENDIPITY_BODY",
    name: "奇遇体质",
    description: "基础 Serendipity +10%。",
    effects: {
      baseSerendipityBonus: 0.1
    }
  };

  return {
    user: {
      id: userId,
      username: "Traveler",
      avatarUrl: null,
      level: 1,
      exp: 0,
      nextLevelExp: 500,
      attributes: {
        vitality: 0,
        exploration: 0,
        happiness: 0,
        flavorExperience: 0,
        nutrition: 0,
        curiosity: 0,
        baseSerendipity: 0.15,
        currentSerendipity: 0.25
      }
    },
    achievements: [
      {
        code: "SPICE_ROVER",
        name: "Spice Rover",
        title: "香料探索者",
        branch: "GOURMET",
        unlockedAt: new Date().toISOString(),
        buffActive: true,
        buff: digestiveBuff
      },
      {
        code: "FATED_ONE",
        name: "Fated One",
        title: "命运交织者",
        branch: "EXPLORER",
        unlockedAt: new Date().toISOString(),
        buffActive: true,
        buff: serendipityBuff
      }
    ],
    activeBuffs: [digestiveBuff, serendipityBuff]
  };
}

function createLocalJournalHistory(): JournalHistoryResponse {
  const now = new Date().toISOString();
  const delta: AttributeDelta = {
    exp: 36,
    vitality: 5,
    exploration: 1,
    happiness: 8,
    flavorExperience: 9,
    nutrition: 10,
    curiosity: 0,
    serendipity: 0
  };

  return {
    journals: [
      {
        id: "local-food-journal",
        type: "FOOD_CHECK_IN",
        title: "骑楼下的热粥补给",
        summary: "识别并记录艇仔粥。",
        storyText: "艇仔粥的热气贴着青石路升起，新的风味经验被写入冒险日志。",
        createdAt: now,
        attributeDelta: delta,
        metadata: {
          foodName: "艇仔粥",
          cuisine: "Cantonese"
        }
      }
    ],
    foodCodex: [
      {
        id: "local-food-codex",
        foodName: "艇仔粥",
        cuisine: "Cantonese",
        flavorTags: ["鲜香", "温润", "米香", "街坊味"],
        detectedSpices: ["白胡椒", "葱花", "姜丝"],
        imageUrl: null,
        discoveredAt: now
      }
    ]
  };
}

function readMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
