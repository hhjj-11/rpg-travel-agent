import { Prisma } from "@prisma/client";
import type { AchievementBranch } from "@prisma/client";
import type { AchievementSummary, ActiveBuff, SystemAnnouncement } from "../models/api-contracts.js";

type TransactionClient = Prisma.TransactionClient;

interface RuleEngineResult {
  unlockedAchievements: AchievementSummary[];
  systemAnnouncements: SystemAnnouncement[];
}

interface AchievementDefinition {
  code: string;
  name: string;
  title: string;
  branch: AchievementBranch;
  description: string;
  condition: Prisma.InputJsonValue;
  buff: ActiveBuff;
}

const SPICE_ROVER: AchievementDefinition = {
  code: "SPICE_ROVER",
  name: "Spice Rover",
  title: "香料探索者",
  branch: "GOURMET",
  description: "打卡 3 种特色香料饮食。",
  condition: {
    type: "food_check_in",
    requiredDistinctMatches: 3,
    tags: ["川菜", "咖喱", "冬阴功", "Sichuan", "curry", "tom yum"]
  },
  buff: {
    code: "DIGESTIVE_IMMUNITY",
    name: "百毒不侵",
    description: "免疫消化不良 Debuff，且后续异国或特色风味饮食 Happiness 收益 +15%。",
    effects: {
      digestiveDebuffImmune: true,
      foodHappinessMultiplier: 1.15
    }
  }
};

const FATED_ONE: AchievementDefinition = {
  code: "FATED_ONE",
  name: "Fated One",
  title: "命运交织者",
  branch: "EXPLORER",
  description: "主动触发并完成 10 次地理奇遇支线任务。",
  condition: {
    type: "geo_serendipity",
    requiredCompletedQuests: 10
  },
  buff: {
    code: "SERENDIPITY_BODY",
    name: "奇遇体质",
    description: "基础 Serendipity 永久 +10%。",
    effects: {
      baseSerendipityBonus: 0.1
    }
  }
};

const MAIN_ATTRIBUTE_LEVEL_STEP = 50;
const EXP_LEVEL_STEP = 500;

export class RuleEngineService {
  async applyAfterFoodCheckIn(tx: TransactionClient, userId: string): Promise<RuleEngineResult> {
    const unlockedAchievements: AchievementSummary[] = [];
    const systemAnnouncements: SystemAnnouncement[] = [];

    const spiceRover = await this.checkSpiceRover(tx, userId);
    if (spiceRover) {
      unlockedAchievements.push(spiceRover);
      systemAnnouncements.push(createAchievementAnnouncement(spiceRover));
    }

    systemAnnouncements.push(...(await this.recalculateLevel(tx, userId)));

    return {
      unlockedAchievements,
      systemAnnouncements
    };
  }

  async applyAfterTravelQuest(tx: TransactionClient, userId: string): Promise<RuleEngineResult> {
    const unlockedAchievements: AchievementSummary[] = [];
    const systemAnnouncements: SystemAnnouncement[] = [];

    const fatedOne = await this.checkFatedOne(tx, userId);
    if (fatedOne) {
      unlockedAchievements.push(fatedOne);
      systemAnnouncements.push(createAchievementAnnouncement(fatedOne));
    }

    systemAnnouncements.push(...(await this.recalculateLevel(tx, userId)));

    return {
      unlockedAchievements,
      systemAnnouncements
    };
  }

  async applyFoodBuffs(
    tx: TransactionClient,
    userId: string,
    delta: { happiness: number }
  ): Promise<{ happiness: number; multiplier: number }> {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { digestiveDebuffImmune: true }
    });

    if (!user?.digestiveDebuffImmune || delta.happiness <= 0) {
      return {
        happiness: delta.happiness,
        multiplier: 1
      };
    }

    return {
      happiness: Math.ceil(delta.happiness * 1.15),
      multiplier: 1.15
    };
  }

  private async checkSpiceRover(
    tx: TransactionClient,
    userId: string
  ): Promise<AchievementSummary | null> {
    const achievement = await this.ensureAchievement(tx, SPICE_ROVER);
    const existing = await tx.userAchievement.findUnique({
      where: {
        userId_achievementId: {
          userId,
          achievementId: achievement.id
        }
      }
    });

    if (existing) {
      return null;
    }

    const journals = await tx.adventureJournal.findMany({
      where: {
        userId,
        type: "FOOD_CHECK_IN"
      },
      select: {
        foodName: true,
        cuisine: true,
        spices: true,
        metadata: true
      }
    });

    const matchedFoods = new Set<string>();
    for (const journal of journals) {
      if (isSpiceExplorationFood(journal)) {
        matchedFoods.add(journal.foodName ?? `${journal.cuisine ?? "unknown"}-${matchedFoods.size}`);
      }
    }

    if (matchedFoods.size < 3) {
      return null;
    }

    const unlocked = await tx.userAchievement.create({
      data: {
        userId,
        achievementId: achievement.id,
        buffActive: true,
        buffState: {
          activatedBy: "RuleEngineService",
          matchedFoodCount: matchedFoods.size
        } as Prisma.InputJsonValue
      }
    });

    await tx.user.update({
      where: { id: userId },
      data: {
        digestiveDebuffImmune: true
      }
    });

    return toAchievementSummary(SPICE_ROVER, unlocked.unlockedAt);
  }

  private async checkFatedOne(
    tx: TransactionClient,
    userId: string
  ): Promise<AchievementSummary | null> {
    const achievement = await this.ensureAchievement(tx, FATED_ONE);
    const existing = await tx.userAchievement.findUnique({
      where: {
        userId_achievementId: {
          userId,
          achievementId: achievement.id
        }
      }
    });

    if (existing) {
      return null;
    }

    const completedQuestCount = await tx.adventureJournal.count({
      where: {
        userId,
        type: "GEO_SERENDIPITY",
        geoQuestStatus: "COMPLETED"
      }
    });

    if (completedQuestCount < 10) {
      return null;
    }

    const unlocked = await tx.userAchievement.create({
      data: {
        userId,
        achievementId: achievement.id,
        buffActive: true,
        buffState: {
          activatedBy: "RuleEngineService",
          completedQuestCount
        } as Prisma.InputJsonValue
      }
    });

    await tx.user.update({
      where: { id: userId },
      data: {
        baseSerendipity: { increment: 0.1 },
        currentSerendipity: { increment: 0.1 }
      }
    });

    return toAchievementSummary(FATED_ONE, unlocked.unlockedAt);
  }

  private async recalculateLevel(
    tx: TransactionClient,
    userId: string
  ): Promise<SystemAnnouncement[]> {
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId }
    });
    const levelFromExp = Math.floor(user.exp / EXP_LEVEL_STEP) + 1;
    const strongestMainAttribute = Math.max(
      user.vitality,
      user.exploration,
      user.happiness,
      user.flavorExperience
    );
    const levelFromAttributes = Math.floor(strongestMainAttribute / MAIN_ATTRIBUTE_LEVEL_STEP) + 1;
    const nextLevel = Math.max(user.level, levelFromExp, levelFromAttributes);

    if (nextLevel <= user.level) {
      return [];
    }

    await tx.user.update({
      where: { id: userId },
      data: {
        level: nextLevel
      }
    });

    const announcement: SystemAnnouncement = {
      type: "LEVEL_UP",
      title: `Level ${nextLevel}`,
      text: `你的主属性回响成新的等级刻印。角色等级提升至 Lv.${nextLevel}，现实冒险的地图边界向外延展了一格。`
    };

    await tx.adventureJournal.create({
      data: {
        userId,
        type: "AI_STORY",
        title: `Level ${nextLevel}`,
        summary: "系统等级通告",
        storyText: announcement.text,
        metadata: {
          source: "RuleEngineService",
          level: nextLevel
        } as Prisma.InputJsonValue
      }
    });

    return [announcement];
  }

  private async ensureAchievement(tx: TransactionClient, definition: AchievementDefinition) {
    return tx.achievement.upsert({
      where: { code: definition.code },
      update: {
        name: definition.name,
        title: definition.title,
        branch: definition.branch,
        description: definition.description,
        condition: definition.condition,
        buff: definition.buff as unknown as Prisma.InputJsonValue,
        status: "ACTIVE"
      },
      create: {
        code: definition.code,
        name: definition.name,
        title: definition.title,
        branch: definition.branch,
        description: definition.description,
        condition: definition.condition,
        buff: definition.buff as unknown as Prisma.InputJsonValue,
        status: "ACTIVE"
      }
    });
  }
}

export function isRetryableRuleTransactionError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2034" || error.code === "P2002")
  );
}

function createAchievementAnnouncement(achievement: AchievementSummary): SystemAnnouncement {
  return {
    type: "ACHIEVEMENT_UNLOCKED",
    title: achievement.title,
    text: `成就解锁：【${achievement.title}】。${achievement.buff.description}`
  };
}

function toAchievementSummary(
  definition: AchievementDefinition,
  unlockedAt: Date
): AchievementSummary {
  return {
    code: definition.code,
    name: definition.name,
    title: definition.title,
    branch: definition.branch,
    unlockedAt: unlockedAt.toISOString(),
    buffActive: true,
    buff: definition.buff
  };
}

function isSpiceExplorationFood(journal: {
  foodName: string | null;
  cuisine: string | null;
  spices: string[];
  metadata: unknown;
}): boolean {
  const metadata = readRecord(journal.metadata);
  const flavorTags = readStringArray(metadata.flavorTags);
  const text = [
    journal.foodName,
    journal.cuisine,
    ...journal.spices,
    ...flavorTags
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return [
    "川菜",
    "四川",
    "麻辣",
    "花椒",
    "咖喱",
    "curry",
    "冬阴功",
    "tom yum",
    "thai",
    "香料",
    "spice"
  ].some((keyword) => text.includes(keyword.toLowerCase()));
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
