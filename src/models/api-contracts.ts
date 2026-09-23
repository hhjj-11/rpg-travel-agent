export interface AttributeBlock {
  vitality: number;
  exploration: number;
  happiness: number;
  flavorExperience: number;
  nutrition: number;
  curiosity: number;
  baseSerendipity: number;
  currentSerendipity: number;
}

export interface ActiveBuff {
  code: string;
  name: string;
  description: string;
  effects: Record<string, number | string | boolean>;
}

export interface AchievementSummary {
  code: string;
  name: string;
  title: string;
  branch: "GOURMET" | "EXPLORER";
  unlockedAt: string;
  buffActive: boolean;
  buff: ActiveBuff;
}

export interface SystemAnnouncement {
  type: "LEVEL_UP" | "ACHIEVEMENT_UNLOCKED";
  title: string;
  text: string;
}

export interface UserProfileResponse {
  user: {
    id: string;
    username: string;
    avatarUrl: string | null;
    level: number;
    exp: number;
    nextLevelExp: number;
    attributes: AttributeBlock;
  };
  achievements: AchievementSummary[];
  activeBuffs: ActiveBuff[];
}

export interface ScanFoodRequest {
  userId?: string;
  image?: string;
  imageFileName?: string;
  contentType?: string;
}

export interface AttributeDelta {
  exp: number;
  vitality: number;
  exploration: number;
  happiness: number;
  flavorExperience: number;
  nutrition: number;
  curiosity: number;
  serendipity: number;
}

export interface ScanFoodResponse {
  recognition: {
    status: "ANALYZED";
    foodName: string;
    cuisine: string;
    flavorTags: string[];
    detectedSpices: string[];
    confidence: number;
  };
  attributeDelta: AttributeDelta;
  story: {
    title: string;
    text: string;
  };
  unlockedAchievements: AchievementSummary[];
  systemAnnouncements?: SystemAnnouncement[];
  journalId: string;
}

export interface LocationSyncRequest {
  userId?: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp?: number;
  source?: "manual" | "active-agent";
}

export interface QuestBoardRequest {
  userId?: string;
  latitude: number;
  longitude: number;
  count?: number;
}

export type CommissionScenario = "STUDYING" | "DINING" | "AFTER_DINING" | "FREE_EXPLORE" | "UNKNOWN";

export interface CommissionIntentRequest {
  userId?: string;
  text: string;
  latitude?: number;
  longitude?: number;
}

export interface CommissionIntentResponse {
  shouldGenerateCommission: boolean;
  scenario: CommissionScenario;
  reply: string;
  askAccept: boolean;
}

export interface CommissionGenerateRequest {
  userId?: string;
  scenario: CommissionScenario;
  latitude: number;
  longitude: number;
}

export interface CommissionGenerateResponse {
  status: "READY";
  scenario: CommissionScenario;
  commission: QuestBoardItem;
}

export interface CommissionCompleteRequest {
  userId?: string;
  commission: QuestBoardItem;
  userNote?: string;
}

export interface CommissionCompleteResponse {
  status: "COMPLETED";
  title: string;
  literarySummary: string;
  style: string;
  completedAt: string;
}

export interface QuestBoardItem {
  id: string;
  title: string;
  subtitle: string;
  difficulty: "EASY" | "NORMAL" | "HARD";
  commissionType: "WALK" | "RANDOM" | "SCENIC" | "CULTURE" | "FOOD_STREET";
  xp: number;
  rewardTags: string[];
  description: string;
  suitableFor: string;
  routeLines: RouteLine[];
  pois: PoiCoordinate[];
}

export interface QuestBoardResponse {
  status: "READY";
  generatedAt: string;
  quests: QuestBoardItem[];
}

export interface SseEvent<TData = unknown> {
  event: string;
  data: TData;
}

export interface PoiCoordinate {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  type: "START" | "POI" | "DESTINATION";
  hint: string;
}

export interface RouteLine {
  id: string;
  name: string;
  coordinates: Array<{
    latitude: number;
    longitude: number;
  }>;
}

export interface SerendipityRoll {
  baseChance: number;
  rolled: number;
  triggered: boolean;
}

export interface LocationSafeResponse {
  status: "SAFE";
  serendipityRoll: SerendipityRoll;
  message: string;
  reason?: "NO_TRIGGER" | "COOLDOWN";
  nextCheckAfterMs?: number;
}

export interface LocationQuestPayload {
  status: "TRIGGERED";
  questId: string;
  title: string;
  serendipityRoll: SerendipityRoll;
  routeLines: RouteLine[];
  pois: PoiCoordinate[];
}

export type LocationSyncResponse = LocationSafeResponse | LocationQuestPayload;

export interface JournalHistoryItem {
  id: string;
  type: "FOOD_CHECK_IN" | "GEO_SERENDIPITY" | "EXPLORATION_ROUTE" | "AI_STORY";
  title: string;
  summary: string;
  storyText: string;
  createdAt: string;
  attributeDelta: AttributeDelta;
  metadata?: Record<string, unknown>;
}

export interface FoodCodexItem {
  id: string;
  foodName: string;
  cuisine: string;
  flavorTags: string[];
  detectedSpices: string[];
  imageUrl: string | null;
  discoveredAt: string;
}

export interface JournalHistoryResponse {
  journals: JournalHistoryItem[];
  foodCodex: FoodCodexItem[];
}
