import { env } from "../config/env.js";
import type {
  AttributeDelta,
  CommissionCompleteResponse,
  CommissionIntentResponse,
  CommissionScenario,
  QuestBoardItem
} from "../models/api-contracts.js";

export interface NearbyPoi {
  id: string;
  name: string;
  category: "老字号" | "古迹" | "小巷" | "市集" | "公园" | "其他";
  latitude: number;
  longitude: number;
  address?: string;
  reason: string;
}

export interface TravelQuestJsonOutput {
  title: string;
  storySegments: string[];
  attributeDelta: AttributeDelta;
}

export interface QuestBoardJsonOutput {
  quests: QuestBoardItem[];
}

export interface CommissionSummaryJsonOutput {
  title: string;
  literarySummary: string;
  style: string;
}

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export class AgentModelClient {
  async interpretCommissionIntent(text: string): Promise<CommissionIntentResponse> {
    if (!env.ai.apiKey) {
      return interpretIntentLocally(text);
    }

    const content = await this.chatJson(
      [
        {
          role: "system",
          content:
            "你是主动式旅行 Agent 的语义判定器。只返回 JSON，不要输出 Markdown。"
        },
        {
          role: "user",
          content:
            `用户输入：${text}\n` +
            "请判断是否应该生成探索委托。返回 JSON 字段：shouldGenerateCommission, scenario, reply, askAccept。\n" +
            "scenario 只能是 STUDYING, DINING, AFTER_DINING, FREE_EXPLORE, UNKNOWN。\n" +
            "如果用户在学习/工作/休息/明显不想被打扰，应 shouldGenerateCommission=false，reply 用安抚话术，例如“那我不打扰你啦”。\n" +
            "如果用户准备吃饭，scenario=DINING；如果用户吃完饭，scenario=AFTER_DINING；如果用户想出去走走/无聊/想探索，scenario=FREE_EXPLORE。"
        }
      ],
      "Commission intent model"
    );

    return normalizeCommissionIntent(parseJsonObject(content));
  }

  async composeTravelQuest(params: {
    username: string;
    latitude: number;
    longitude: number;
    pois: NearbyPoi[];
  }): Promise<TravelQuestJsonOutput> {
    if (!env.ai.apiKey) {
      return this.createLocalTravelQuest(params.pois);
    }

    const content = await this.chatJson(
      [
        {
          role: "system",
          content:
            "你是一个基于地理位置生成 RPG 支线任务的旅行 Agent。只返回 JSON，不要输出 Markdown。"
        },
        {
          role: "user",
          content:
            `用户 ${params.username} 位于 ${params.latitude},${params.longitude}。\n` +
            `周边 500 米 POI：${JSON.stringify(params.pois)}\n` +
            "请输出 JSON，字段必须是：title, storySegments, attributeDelta。\n" +
            "storySegments 是 3 段打字机文本。attributeDelta 包含 exp,vitality,exploration,happiness,flavorExperience,nutrition,curiosity,serendipity。\n" +
            "剧情要像广州老城区的地理支线任务，有烟火气、路线感和可执行的小目标。"
        }
      ],
      "Travel model"
    );

    return normalizeTravelQuest(parseJsonObject(content));
  }

  async composeQuestBoard(params: {
    latitude: number;
    longitude: number;
    pois: NearbyPoi[];
  }): Promise<QuestBoardJsonOutput> {
    if (!env.ai.apiKey) {
      return this.createLocalQuestBoard(params.pois);
    }

    const content = await this.chatJson(
      [
        {
          role: "system",
          content:
            "你是一个主动式旅行 Agent 的探索委托板生成器。只返回 JSON，不要输出 Markdown。"
        },
        {
          role: "user",
          content:
            `当前位置：${params.latitude},${params.longitude}。\n` +
            `周边 POI：${JSON.stringify(params.pois)}\n` +
            "请生成 2 到 4 张探索委托卡，风格参考：探索委托单、饭后一公里、路线盲盒。\n" +
            "返回 JSON：{ quests: [...] }。\n" +
            "每个 quest 字段必须包含：id,title,subtitle,difficulty,commissionType,xp,rewardTags,description,suitableFor,routeLines,pois。\n" +
            "difficulty 只能是 EASY, NORMAL, HARD；commissionType 只能是 WALK, RANDOM, SCENIC, CULTURE, FOOD_STREET。\n" +
            "rewardTags 是 2 到 4 个短标签。description 不超过 70 字，suitableFor 不超过 40 字。\n" +
            "routeLines 和 pois 请基于给定 POI 生成，适合前端地图展示。"
        }
      ],
      "Quest board model"
    );

    return normalizeQuestBoard(parseJsonObject(content), params.pois);
  }

  async composeCommissionSummary(params: {
    commission: QuestBoardItem;
    userNote?: string;
  }): Promise<CommissionSummaryJsonOutput> {
    if (!env.ai.apiKey) {
      return {
        title: `${params.commission.title}完成记`,
        literarySummary:
          "你把一段普通路程走成了自己的小型章节。街声、灯影和脚步声被收进日志，城市也因此多了一处只属于你的标记。",
        style: "城市散文"
      };
    }

    const content = await this.chatJson(
      [
        {
          role: "system",
          content:
            "你是旅行任务完成页的文学化总结作者。只返回 JSON，不要输出 Markdown。"
        },
        {
          role: "user",
          content:
            `已完成委托：${JSON.stringify(params.commission)}\n` +
            `用户备注：${params.userNote ?? "无"}\n` +
            "请返回 JSON：title, literarySummary, style。\n" +
            "literarySummary 需要有文学性和旅行回忆感，120 到 220 字，不要像攻略。style 可以是城市散文、轻小说旁白、旅行札记等。"
        }
      ],
      "Commission summary model"
    );

    return normalizeCommissionSummary(parseJsonObject(content));
  }


  private async chatJson(messages: ChatMessage[], label: string): Promise<string> {
    const response = await fetch(`${env.ai.apiBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.ai.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: env.ai.model,
        ...(env.ai.responseFormatJson ? { response_format: { type: "json_object" } } : {}),
        messages
      })
    });

    if (!response.ok) {
      throw new Error(`${label} request failed: ${response.status} ${await response.text()}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error(`${label} returned an empty response.`);
    }

    return content;
  }

  private createLocalTravelQuest(pois: NearbyPoi[]): TravelQuestJsonOutput {
    const firstPoi = pois[0]?.name ?? "骑楼旧巷";
    const secondPoi = pois[1]?.name ?? "街角糖水铺";

    return {
      title: "骑楼影里的暗线",
      storySegments: [
        `地图轻轻一震，${firstPoi} 的坐标像一枚旧铜钱浮出屏幕。`,
        `你需要沿着骑楼阴影走到 ${secondPoi}，找出最有生活气的一处招牌。`,
        "完成后记录一句现场听到的声音，城市会把它折成新的支线徽章。"
      ],
      attributeDelta: {
        exp: 32,
        vitality: 0,
        exploration: 8,
        happiness: 5,
        flavorExperience: 0,
        nutrition: 0,
        curiosity: 6,
        serendipity: 0.01
      }
    };
  }

  private createLocalQuestBoard(pois: NearbyPoi[]): QuestBoardJsonOutput {
    const firstPoi = pois[0] ?? createFallbackPoi("fallback-poi-1", "附近街角", 0, 0);
    const secondPoi = pois[1] ?? firstPoi;

    return {
      quests: [
        {
          id: "commission-after-meal-walk",
          title: "饭后一公里",
          subtitle: "桥边散步 · 轻度委托",
          difficulty: "EASY",
          commissionType: "WALK",
          xp: 20,
          rewardTags: ["桥边灯火", "街角糖水", "晚风摊位"],
          description: "吃完只是序章，真正的城市记忆常常从饭后那一小段路开始。",
          suitableFor: "适合想消食、拍风景、顺手收集夜风的人。",
          routeLines: [
            {
              id: "route-after-meal-walk",
              name: "饭后一公里",
              coordinates: [
                { latitude: firstPoi.latitude, longitude: firstPoi.longitude },
                { latitude: secondPoi.latitude, longitude: secondPoi.longitude }
              ]
            }
          ],
          pois: [
            toQuestPoi(firstPoi, "START"),
            toQuestPoi(secondPoi, "DESTINATION")
          ]
        },
        {
          id: "commission-route-blindbox",
          title: "路线盲盒",
          subtitle: "随机委托 · 标准委托",
          difficulty: "NORMAL",
          commissionType: "RANDOM",
          xp: 30,
          rewardTags: ["隐藏巷口", "偶遇小馆", "陌生桥头"],
          description: "不知道今晚要去哪里，就让探索协会替你翻开一页未知地图。",
          suitableFor: "适合临时起意、想被城市带着走的人。",
          routeLines: [
            {
              id: "route-blindbox",
              name: "路线盲盒",
              coordinates: pois.slice(0, 3).map((poi) => ({
                latitude: poi.latitude,
                longitude: poi.longitude
              }))
            }
          ],
          pois: pois.slice(0, 3).map((poi, index) =>
            toQuestPoi(poi, index === 0 ? "START" : index === 2 ? "DESTINATION" : "POI")
          )
        }
      ]
    };
  }
}

function parseJsonObject(content: string): Record<string, unknown> {
  const trimmed = content.trim();
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");

  if (jsonStart < 0 || jsonEnd < jsonStart) {
    throw new Error("Model response did not contain a JSON object.");
  }

  return JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as Record<string, unknown>;
}

function normalizeTravelQuest(value: Record<string, unknown>): TravelQuestJsonOutput {
  return {
    title: readString(value.title, "城市暗线任务"),
    storySegments: readStringArray(value.storySegments).slice(0, 6),
    attributeDelta: normalizeAttributeDelta(value.attributeDelta)
  };
}

function normalizeCommissionIntent(value: Record<string, unknown>): CommissionIntentResponse {
  const scenario = readEnum(
    value.scenario,
    ["STUDYING", "DINING", "AFTER_DINING", "FREE_EXPLORE", "UNKNOWN"],
    "UNKNOWN"
  );
  const shouldGenerateCommission =
    typeof value.shouldGenerateCommission === "boolean"
      ? value.shouldGenerateCommission
      : scenario === "DINING" || scenario === "AFTER_DINING" || scenario === "FREE_EXPLORE";

  return {
    shouldGenerateCommission,
    scenario,
    reply: readString(value.reply, shouldGenerateCommission ? "是否接受新委托？" : "那我不打扰你啦"),
    askAccept: typeof value.askAccept === "boolean" ? value.askAccept : shouldGenerateCommission
  };
}

function normalizeCommissionSummary(value: Record<string, unknown>): CommissionSummaryJsonOutput {
  return {
    title: readString(value.title, "委托完成"),
    literarySummary: readString(
      value.literarySummary,
      "你把一段普通路程走成了自己的小型章节。街声、灯影和脚步声被收进日志，城市也因此多了一处只属于你的标记。"
    ),
    style: readString(value.style, "城市散文")
  };
}

function interpretIntentLocally(text: string): CommissionIntentResponse {
  const normalized = text.toLowerCase();

  if (/(学习|上课|写作业|工作|开会|睡觉|休息)/.test(normalized)) {
    return {
      shouldGenerateCommission: false,
      scenario: "STUDYING",
      reply: "那我不打扰你啦。",
      askAccept: false
    };
  }

  if (/(吃完|吃好了|饭后|刚吃完)/.test(normalized)) {
    return {
      shouldGenerateCommission: true,
      scenario: "AFTER_DINING",
      reply: "是否接受新委托？我可以为你翻开一张饭后散步路线。",
      askAccept: true
    };
  }

  if (/(吃饭|用餐|觅食|找吃的|饿了)/.test(normalized)) {
    return {
      shouldGenerateCommission: true,
      scenario: "DINING",
      reply: "是否接受新委托？我可以为你生成一张附近探店委托。",
      askAccept: true
    };
  }

  if (/(无聊|出去|走走|探索|逛逛|散步)/.test(normalized)) {
    return {
      shouldGenerateCommission: true,
      scenario: "FREE_EXPLORE",
      reply: "是否接受新委托？附近的地图边缘已经有一点发光了。",
      askAccept: true
    };
  }

  return {
    shouldGenerateCommission: false,
    scenario: "UNKNOWN",
    reply: "我先保持安静，需要出发时再叫我。",
    askAccept: false
  };
}

function normalizeQuestBoard(value: Record<string, unknown>, fallbackPois: NearbyPoi[]): QuestBoardJsonOutput {
  const quests = Array.isArray(value.quests) ? value.quests : [];
  const normalized = quests
    .map((quest, index) => normalizeQuestItem(quest, index, fallbackPois))
    .filter((quest): quest is QuestBoardItem => Boolean(quest))
    .slice(0, 4);

  return normalized.length > 0
    ? { quests: normalized }
    : createLocalQuestBoardOutput(fallbackPois);
}

function normalizeQuestItem(value: unknown, index: number, fallbackPois: NearbyPoi[]): QuestBoardItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const pois = normalizeQuestPois(record.pois, fallbackPois);
  const routeLines = normalizeRouteLines(record.routeLines, pois);

  return {
    id: readString(record.id, `commission-${index + 1}`),
    title: readString(record.title, "未知委托"),
    subtitle: readString(record.subtitle, "探索委托单"),
    difficulty: readEnum(record.difficulty, ["EASY", "NORMAL", "HARD"], "NORMAL"),
    commissionType: readEnum(
      record.commissionType,
      ["WALK", "RANDOM", "SCENIC", "CULTURE", "FOOD_STREET"],
      "RANDOM"
    ),
    xp: Math.round(clamp(readNumber(record.xp, 20), 5, 100)),
    rewardTags: readStringArray(record.rewardTags).slice(0, 4),
    description: readString(record.description, "一张刚刚从城市边缘浮现的探索委托。"),
    suitableFor: readString(record.suitableFor, "适合想被城市带着走的人。"),
    routeLines,
    pois
  };
}

function normalizeQuestPois(value: unknown, fallbackPois: NearbyPoi[]) {
  if (!Array.isArray(value) || value.length === 0) {
    return fallbackPois.slice(0, 3).map((poi, index) =>
      toQuestPoi(poi, index === 0 ? "START" : index === 2 ? "DESTINATION" : "POI")
    );
  }

  return value
    .map((item, index) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Record<string, unknown>;
      const latitude = readNumber(record.latitude, Number.NaN);
      const longitude = readNumber(record.longitude, Number.NaN);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return null;
      }

      return {
        id: readString(record.id, `quest-poi-${index}`),
        name: readString(record.name, "未知地点"),
        latitude,
        longitude,
        type: readEnum(record.type, ["START", "POI", "DESTINATION"], index === 0 ? "START" : "POI"),
        hint: readString(record.hint, "探索委托节点。")
      };
    })
    .filter((item): item is QuestBoardItem["pois"][number] => Boolean(item));
}

function normalizeRouteLines(value: unknown, pois: QuestBoardItem["pois"]) {
  if (!Array.isArray(value) || value.length === 0) {
    return [
      {
        id: "quest-route",
        name: "委托路线",
        coordinates: pois.map((poi) => ({
          latitude: poi.latitude,
          longitude: poi.longitude
        }))
      }
    ];
  }

  return value
    .map((item, index) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Record<string, unknown>;
      const coordinates = Array.isArray(record.coordinates)
        ? record.coordinates
            .map((coordinate) => {
              if (!coordinate || typeof coordinate !== "object") {
                return null;
              }

              const coordinateRecord = coordinate as Record<string, unknown>;
              const latitude = readNumber(coordinateRecord.latitude, Number.NaN);
              const longitude = readNumber(coordinateRecord.longitude, Number.NaN);
              return Number.isFinite(latitude) && Number.isFinite(longitude)
                ? { latitude, longitude }
                : null;
            })
            .filter(Boolean)
        : [];

      return {
        id: readString(record.id, `quest-route-${index}`),
        name: readString(record.name, "委托路线"),
        coordinates
      };
    })
    .filter((item): item is QuestBoardItem["routeLines"][number] => Boolean(item));
}

function createLocalQuestBoardOutput(pois: NearbyPoi[]): QuestBoardJsonOutput {
  const firstPoi = pois[0] ?? createFallbackPoi("fallback-poi-1", "附近街角", 0, 0);
  const secondPoi = pois[1] ?? firstPoi;

  return {
    quests: [
      {
        id: "commission-after-meal-walk",
        title: "饭后一公里",
        subtitle: "桥边散步 · 轻度委托",
        difficulty: "EASY",
        commissionType: "WALK",
        xp: 20,
        rewardTags: ["桥边灯火", "街角糖水", "晚风摊位"],
        description: "吃完只是序章，真正的城市记忆常常从饭后那一小段路开始。",
        suitableFor: "适合想消食、拍风景、顺手收集夜风的人。",
        routeLines: [
          {
            id: "route-after-meal-walk",
            name: "饭后一公里",
            coordinates: [
              { latitude: firstPoi.latitude, longitude: firstPoi.longitude },
              { latitude: secondPoi.latitude, longitude: secondPoi.longitude }
            ]
          }
        ],
        pois: [toQuestPoi(firstPoi, "START"), toQuestPoi(secondPoi, "DESTINATION")]
      },
      {
        id: "commission-route-blindbox",
        title: "路线盲盒",
        subtitle: "随机委托 · 标准委托",
        difficulty: "NORMAL",
        commissionType: "RANDOM",
        xp: 30,
        rewardTags: ["隐藏巷口", "偶遇小馆", "陌生桥头"],
        description: "不知道今晚要去哪里，就让探索协会替你翻开一页未知地图。",
        suitableFor: "适合临时起意、想被城市带着走的人。",
        routeLines: [
          {
            id: "route-blindbox",
            name: "路线盲盒",
            coordinates: pois.slice(0, 3).map((poi) => ({
              latitude: poi.latitude,
              longitude: poi.longitude
            }))
          }
        ],
        pois: pois.slice(0, 3).map((poi, index) =>
          toQuestPoi(poi, index === 0 ? "START" : index === 2 ? "DESTINATION" : "POI")
        )
      }
    ]
  };
}

function toQuestPoi(poi: NearbyPoi, type: "START" | "POI" | "DESTINATION") {
  return {
    id: poi.id,
    name: poi.name,
    latitude: poi.latitude,
    longitude: poi.longitude,
    type,
    hint: poi.reason
  };
}

function createFallbackPoi(id: string, name: string, latitude: number, longitude: number): NearbyPoi {
  return {
    id,
    name,
    category: "其他",
    latitude,
    longitude,
    reason: "本地兜底地点。"
  };
}

function normalizeAttributeDelta(value: unknown): AttributeDelta {
  const delta = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return {
    exp: Math.round(clamp(readNumber(delta.exp, 20), 0, 300)),
    vitality: Math.round(clamp(readNumber(delta.vitality, 0), -30, 50)),
    exploration: Math.round(clamp(readNumber(delta.exploration, 0), -30, 50)),
    happiness: Math.round(clamp(readNumber(delta.happiness, 0), -30, 50)),
    flavorExperience: Math.round(clamp(readNumber(delta.flavorExperience, 0), -30, 50)),
    nutrition: Math.round(clamp(readNumber(delta.nutrition, 0), -30, 50)),
    curiosity: Math.round(clamp(readNumber(delta.curiosity, 0), -30, 50)),
    serendipity: clamp(readNumber(delta.serendipity, 0), -0.2, 0.2)
  };
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
