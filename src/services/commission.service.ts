import type {
  CommissionCompleteRequest,
  CommissionCompleteResponse,
  CommissionGenerateRequest,
  CommissionGenerateResponse,
  CommissionIntentResponse,
  QuestBoardItem
} from "../models/api-contracts.js";
import { AgentModelClient } from "./agent-model.client.js";
import { AmapMapClient } from "./amap-map.client.js";

const AMAP_DINING_TYPES = "050000";
const AMAP_LEISURE_WALK_TYPES = ["050000", "080000", "110000", "140000"].join("|");

export class CommissionService {
  constructor(
    private readonly modelClient = new AgentModelClient(),
    private readonly amapMapClient = new AmapMapClient()
  ) {}

  async interpret(text: string): Promise<CommissionIntentResponse> {
    return this.modelClient.interpretCommissionIntent(text);
  }

  async generate(request: CommissionGenerateRequest): Promise<CommissionGenerateResponse> {
    const pois = await this.amapMapClient.searchNearbyPois({
      latitude: request.latitude,
      longitude: request.longitude,
      radiusMeters: request.scenario === "AFTER_DINING" ? 1200 : 800,
      types: request.scenario === "DINING" ? AMAP_DINING_TYPES : AMAP_LEISURE_WALK_TYPES,
      keywords: request.scenario === "DINING" ? "餐饮|小吃|茶楼|老字号" : undefined
    });
    const board = await this.modelClient.composeQuestBoard({
      latitude: request.latitude,
      longitude: request.longitude,
      pois
    });
    const commission = adaptCommissionForScenario(board.quests[0], request.scenario);

    return {
      status: "READY",
      scenario: request.scenario,
      commission
    };
  }

  async complete(request: CommissionCompleteRequest): Promise<CommissionCompleteResponse> {
    const summary = await this.modelClient.composeCommissionSummary({
      commission: request.commission,
      userNote: request.userNote
    });

    return {
      status: "COMPLETED",
      title: summary.title,
      literarySummary: summary.literarySummary,
      style: summary.style,
      completedAt: new Date().toISOString()
    };
  }
}

function adaptCommissionForScenario(
  commission: QuestBoardItem,
  scenario: CommissionGenerateRequest["scenario"]
): QuestBoardItem {
  if (scenario === "DINING") {
    return {
      ...commission,
      title: commission.title || "附近探店委托",
      subtitle: "探店探索 · 标准委托",
      commissionType: "FOOD_STREET",
      rewardTags: commission.rewardTags.length > 0 ? commission.rewardTags : ["附近餐饮", "街角小店", "城市烟火"],
      description: commission.description || "从附近餐饮店里挑一个目的地，让今晚的路线从一口热食开始。"
    };
  }

  if (scenario === "AFTER_DINING") {
    return {
      ...commission,
      title: commission.title || "饭后一公里",
      subtitle: "休闲散步 · 轻度委托",
      commissionType: "WALK",
      difficulty: "EASY",
      rewardTags: commission.rewardTags.length > 0 ? commission.rewardTags : ["桥边灯火", "晚风摊位", "饭后散步"],
      description: commission.description || "吃完只是序章，真正的城市记忆常常从饭后那一小段路开始。"
    };
  }

  return commission;
}
