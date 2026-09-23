import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { Prisma, type PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../config/database.js";
import type {
  AttributeDelta,
  LocationSafeResponse,
  LocationSyncRequest,
  PoiCoordinate,
  QuestBoardRequest,
  QuestBoardResponse,
  RouteLine,
  SerendipityRoll,
  SseEvent
} from "../models/api-contracts.js";
import { AgentModelClient } from "./agent-model.client.js";
import type { NearbyPoi, TravelQuestJsonOutput } from "./agent-model.client.js";
import { AmapMapClient } from "./amap-map.client.js";
import { isRetryableRuleTransactionError, RuleEngineService } from "./rule-engine.service.js";

interface TravelUserState {
  id: string;
  username: string;
  level: number;
  baseSerendipity: number;
  serendipityBuffBonus: number;
}

interface LocationState {
  latitude: number;
  longitude: number;
}

interface TravelQuestState {
  title: string;
  storySegments: string[];
  attributeDelta: AttributeDelta;
  routeLines: RouteLine[];
  pois: PoiCoordinate[];
}

interface TriggeredRun {
  status: "TRIGGERED";
  user: TravelUserState;
  location: LocationState;
  serendipityRoll: SerendipityRoll;
}

const recentQuestTriggers = new Map<string, number>();

const TravelGraphState = Annotation.Root({
  user: Annotation<TravelUserState>(),
  location: Annotation<LocationState>(),
  serendipityRoll: Annotation<SerendipityRoll>(),
  nearbyPois: Annotation<NearbyPoi[]>({
    reducer: (_previous, next) => next,
    default: () => []
  }),
  quest: Annotation<TravelQuestState | null>({
    reducer: (_previous, next) => next,
    default: () => null
  })
});

export class TravelAgentService {
  constructor(
    private readonly db: PrismaClient = prisma,
    private readonly amapMapClient = new AmapMapClient(),
    private readonly modelClient = new AgentModelClient(),
    private readonly ruleEngine = new RuleEngineService()
  ) {}

  async evaluateLocation(
    userId: string,
    location: LocationSyncRequest
  ): Promise<LocationSafeResponse | TriggeredRun> {
    const user = await this.loadTravelUser(userId);
    const baseChance = clamp(user.baseSerendipity + user.serendipityBuffBonus, 0, 0.95);
    const cooldownRemainingMs = await this.getCooldownRemainingMs(userId);

    if (cooldownRemainingMs > 0) {
      return {
        status: "SAFE",
        serendipityRoll: {
          baseChance,
          rolled: 1,
          triggered: false
        },
        reason: "COOLDOWN",
        nextCheckAfterMs: cooldownRemainingMs,
        message: `主动智能体正在冷却中，约 ${Math.ceil(cooldownRemainingMs / 1000)} 秒后再次检测奇遇。`
      };
    }

    const serendipityRoll = this.rollDice(baseChance);

    if (!serendipityRoll.triggered) {
      return {
        status: "SAFE",
        serendipityRoll,
        reason: "NO_TRIGGER",
        message: "当前位置稳定，没有触发隐藏支线。地图保持巡航状态。"
      };
    }

    return {
      status: "TRIGGERED",
      user,
      location: {
        latitude: location.latitude,
        longitude: location.longitude
      },
      serendipityRoll
    };
  }

  async *streamTriggeredQuest(run: TriggeredRun): AsyncGenerator<SseEvent> {
    const graph = this.buildTravelGraph();
    const graphResult = await graph.invoke({
      user: run.user,
      location: run.location,
      serendipityRoll: run.serendipityRoll
    });

    const quest = graphResult.quest;
    if (!quest) {
      throw new Error("Travel graph finished without a quest payload.");
    }

    const questId = `geo-quest-${Date.now()}`;
    this.markQuestTriggered(run.user.id);

    yield {
      event: "quest",
      data: {
        status: "TRIGGERED",
        questId,
        title: quest.title,
        serendipityRoll: run.serendipityRoll,
        routeLines: quest.routeLines,
        pois: quest.pois
      }
    };

    for (const segment of quest.storySegments) {
      yield {
        event: "story-token",
        data: {
          questId,
          text: segment
        }
      };
    }

    yield {
      event: "route",
      data: {
        questId,
        routeLines: quest.routeLines,
        pois: quest.pois
      }
    };

    const ruleResult = await this.persistTravelQuest(run.user.id, run.location, quest);

    for (const achievement of ruleResult.unlockedAchievements) {
      yield {
        event: "achievement",
        data: achievement
      };
    }

    for (const announcement of ruleResult.systemAnnouncements) {
      yield {
        event: "system-announcement",
        data: announcement
      };
    }

    yield {
      event: "complete",
      data: {
        questId,
        message: "奇遇剧情推送完成。"
      }
    };
  }

  async generateQuestBoard(
    _userId: string,
    request: QuestBoardRequest
  ): Promise<QuestBoardResponse> {
    const nearbyPois = await this.amapMapClient.searchNearbyPois({
      latitude: request.latitude,
      longitude: request.longitude,
      radiusMeters: 900
    });
    const board = await this.modelClient.composeQuestBoard({
      latitude: request.latitude,
      longitude: request.longitude,
      pois: nearbyPois
    });

    return {
      status: "READY",
      generatedAt: new Date().toISOString(),
      quests: board.quests.slice(0, request.count ?? 4)
    };
  }

  private buildTravelGraph() {
    return new StateGraph(TravelGraphState)
      .addNode("fetch_amap_pois", async (state: typeof TravelGraphState.State) => {
        const nearbyPois = await this.amapMapClient.searchNearbyPois({
          latitude: state.location.latitude,
          longitude: state.location.longitude,
          radiusMeters: 500
        });

        return { nearbyPois };
      })
      .addNode("compose_geo_quest", async (state: typeof TravelGraphState.State) => {
        const questDraft = await this.modelClient.composeTravelQuest({
          username: state.user.username,
          latitude: state.location.latitude,
          longitude: state.location.longitude,
          pois: state.nearbyPois
        });

        return {
          quest: this.createQuestState(state.location, state.nearbyPois, questDraft)
        };
      })
      .addEdge(START, "fetch_amap_pois")
      .addEdge("fetch_amap_pois", "compose_geo_quest")
      .addEdge("compose_geo_quest", END)
      .compile();
  }

  private async loadTravelUser(userId: string): Promise<TravelUserState> {
    if (!env.databaseUrl) {
      return {
        id: userId,
        username: "Traveler",
        level: 1,
        baseSerendipity: 0.15,
        serendipityBuffBonus: 0.1
      };
    }

    const user = await this.db.user.upsert({
      where: { id: userId },
      update: {},
      create: {
        id: userId,
        username: "Traveler",
        baseSerendipity: 0.05,
        currentSerendipity: 0.05
      },
      include: {
        achievements: {
          where: { buffActive: true },
          include: { achievement: true }
        }
      }
    });

    return {
      id: user.id,
      username: user.username,
      level: user.level,
      baseSerendipity: user.baseSerendipity,
      serendipityBuffBonus: user.achievements.reduce(
        (sum, item) =>
          item.achievement.code === "FATED_ONE"
            ? sum
            : sum + readBuffNumber(item.achievement.buff, "baseSerendipityBonus"),
        0
      )
    };
  }

  private rollDice(baseChance: number): SerendipityRoll {
    const rolled = Number(Math.random().toFixed(4));

    return {
      baseChance,
      rolled,
      triggered: baseChance >= rolled
    };
  }

  private createQuestState(
    location: LocationState,
    nearbyPois: NearbyPoi[],
    questDraft: TravelQuestJsonOutput
  ): TravelQuestState {
    const questPois = nearbyPois.slice(0, 3);
    const poiCoordinates: PoiCoordinate[] = [
      {
        id: "poi-start",
        name: "当前位置",
        latitude: location.latitude,
        longitude: location.longitude,
        type: "START",
        hint: "从这里进入地理支线。"
      },
      ...questPois.map((poi, index): PoiCoordinate => ({
        id: poi.id,
        name: poi.name,
        latitude: poi.latitude,
        longitude: poi.longitude,
        type: index === questPois.length - 1 ? "DESTINATION" : "POI",
        hint: poi.reason
      }))
    ];

    return {
      title: questDraft.title,
      storySegments: questDraft.storySegments,
      attributeDelta: questDraft.attributeDelta,
      pois: poiCoordinates,
      routeLines: [
        {
          id: "route-line-amap-001",
          name: questDraft.title,
          coordinates: poiCoordinates.map((poi) => ({
            latitude: poi.latitude,
            longitude: poi.longitude
          }))
        }
      ]
    };
  }

  private async persistTravelQuest(
    userId: string,
    location: LocationState,
    quest: TravelQuestState
  ) {
    if (!env.databaseUrl) {
      return {
        unlockedAchievements: [],
        systemAnnouncements: []
      };
    }

    return this.runSerializableTransaction(async (tx) => {
      await tx.user.findUniqueOrThrow({
        where: { id: userId }
      });

      await tx.user.update({
        where: { id: userId },
        data: {
          exp: { increment: quest.attributeDelta.exp },
          vitality: { increment: quest.attributeDelta.vitality },
          exploration: { increment: quest.attributeDelta.exploration },
          happiness: { increment: quest.attributeDelta.happiness },
          flavorExperience: { increment: quest.attributeDelta.flavorExperience },
          nutrition: { increment: quest.attributeDelta.nutrition },
          curiosity: { increment: quest.attributeDelta.curiosity },
          currentSerendipity: { increment: quest.attributeDelta.serendipity }
        }
      });

      await tx.adventureJournal.create({
        data: {
          userId,
          type: "GEO_SERENDIPITY",
          title: quest.title,
          summary: "Triggered by active location agent and composed from AMap POIs.",
          storyText: quest.storySegments.join("\n"),
          geoQuestStatus: "COMPLETED",
          latitude: location.latitude,
          longitude: location.longitude,
          routePlan: {
            routeLines: quest.routeLines,
            pois: quest.pois
          } as unknown as Prisma.InputJsonValue,
          expDelta: quest.attributeDelta.exp,
          vitalityDelta: quest.attributeDelta.vitality,
          explorationDelta: quest.attributeDelta.exploration,
          happinessDelta: quest.attributeDelta.happiness,
          flavorExperienceDelta: quest.attributeDelta.flavorExperience,
          nutritionDelta: quest.attributeDelta.nutrition,
          curiosityDelta: quest.attributeDelta.curiosity,
          serendipityDelta: quest.attributeDelta.serendipity,
          metadata: {
            provider: {
              langGraph: "@langchain/langgraph",
              amap: env.amap.apiKey ? "configured-amap-web-service" : "local-development-poi-provider",
              ai: env.ai.apiKey ? "configured-ai-provider" : "local-development-provider"
            }
          } as Prisma.InputJsonValue
        }
      });

      return this.ruleEngine.applyAfterTravelQuest(tx, userId);
    });
  }

  private async getCooldownRemainingMs(userId: string): Promise<number> {
    const now = Date.now();
    const memoryTriggeredAt = recentQuestTriggers.get(userId);

    if (memoryTriggeredAt) {
      const remaining = env.activeAgent.questCooldownMs - (now - memoryTriggeredAt);
      if (remaining > 0) {
        return remaining;
      }
    }

    if (!env.databaseUrl) {
      return 0;
    }

    const latestQuest = await this.db.adventureJournal.findFirst({
      where: {
        userId,
        type: "GEO_SERENDIPITY"
      },
      orderBy: {
        createdAt: "desc"
      },
      select: {
        createdAt: true
      }
    });

    if (!latestQuest) {
      return 0;
    }

    const remaining = env.activeAgent.questCooldownMs - (now - latestQuest.createdAt.getTime());
    return Math.max(0, remaining);
  }

  private markQuestTriggered(userId: string): void {
    recentQuestTriggers.set(userId, Date.now());
  }

  private async runSerializableTransaction<T>(
    callback: (tx: Prisma.TransactionClient) => Promise<T>
  ): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return await this.db.$transaction(callback, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable
        });
      } catch (error) {
        if (attempt === 3 || !isRetryableRuleTransactionError(error)) {
          throw error;
        }
      }
    }

    throw new Error("Serializable transaction retry exhausted.");
  }
}

function readBuffNumber(value: unknown, key: string): number {
  if (!value || typeof value !== "object") {
    return 0;
  }

  const record = value as Record<string, unknown>;
  const direct = record[key];
  if (typeof direct === "number" && Number.isFinite(direct)) {
    return direct;
  }

  const effects = record.effects;
  if (effects && typeof effects === "object") {
    const nested = (effects as Record<string, unknown>)[key];
    if (typeof nested === "number" && Number.isFinite(nested)) {
      return nested;
    }
  }

  return 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
