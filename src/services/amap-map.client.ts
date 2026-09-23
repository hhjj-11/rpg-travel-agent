import { env } from "../config/env.js";
import type { NearbyPoi } from "./agent-model.client.js";

interface AmapAroundResponse {
  status: string;
  info?: string;
  infocode?: string;
  pois?: AmapPoi[];
}

interface AmapPoi {
  id?: string;
  name?: string;
  type?: string;
  address?: string;
  location?: string;
  distance?: string;
  business?: {
    tag?: string;
  };
}

const DEFAULT_AMAP_TYPES = ["050000", "060000", "080000", "110000", "140000"].join("|");

export class AmapMapClient {
  async searchNearbyPois(params: {
    latitude: number;
    longitude: number;
    radiusMeters?: number;
    keywords?: string;
    types?: string;
  }): Promise<NearbyPoi[]> {
    if (!env.amap.apiKey) {
      return createLocalPois(params.latitude, params.longitude);
    }

    const url = new URL("/v5/place/around", env.amap.apiBaseUrl);
    url.searchParams.set("key", env.amap.apiKey);
    url.searchParams.set("location", `${params.longitude},${params.latitude}`);
    url.searchParams.set("radius", String(params.radiusMeters ?? 500));
    url.searchParams.set("types", params.types ?? DEFAULT_AMAP_TYPES);
    url.searchParams.set("sortrule", "distance");
    url.searchParams.set("show_fields", "business");
    url.searchParams.set("output", "json");

    if (params.keywords) {
      url.searchParams.set("keywords", params.keywords);
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`AMap around search failed: ${response.status} ${await response.text()}`);
    }

    const payload = (await response.json()) as AmapAroundResponse;
    if (payload.status !== "1") {
      throw new Error(`AMap around search failed: ${payload.info ?? "unknown"} (${payload.infocode ?? "no infocode"})`);
    }

    const pois = (payload.pois ?? [])
      .map((poi, index) => toNearbyPoi(poi, index))
      .filter((poi): poi is NearbyPoi => Boolean(poi))
      .slice(0, 12);

    return pois.length > 0 ? pois : createLocalPois(params.latitude, params.longitude);
  }
}

function toNearbyPoi(poi: AmapPoi, index: number): NearbyPoi | null {
  if (!poi.name || !poi.location) {
    return null;
  }

  const [longitude, latitude] = poi.location.split(",").map(Number);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const category = normalizeCategory(`${poi.type ?? ""} ${poi.business?.tag ?? ""}`);

  return {
    id: poi.id ?? `amap-poi-${index}`,
    name: poi.name,
    category,
    latitude,
    longitude,
    address: poi.address,
    reason: createPoiReason(category, poi.distance)
  };
}

function normalizeCategory(value: string): NearbyPoi["category"] {
  if (value.includes("名胜古迹") || value.includes("博物馆") || value.includes("文物")) {
    return "古迹";
  }

  if (value.includes("小吃") || value.includes("餐饮") || value.includes("老字号") || value.includes("茶楼")) {
    return "老字号";
  }

  if (value.includes("购物") || value.includes("市场") || value.includes("步行街")) {
    return "市集";
  }

  if (value.includes("公园") || value.includes("风景")) {
    return "公园";
  }

  if (value.includes("道路") || value.includes("街") || value.includes("巷")) {
    return "小巷";
  }

  return "其他";
}

function createPoiReason(category: NearbyPoi["category"], distance?: string): string {
  const distanceText = distance ? `距离约 ${distance} 米，` : "";

  switch (category) {
    case "老字号":
      return `${distanceText}适合作为带有城市烟火气的风味支线节点。`;
    case "古迹":
      return `${distanceText}适合作为历史记忆和隐藏任务的触发点。`;
    case "小巷":
      return `${distanceText}适合作为奇遇路线中的转折点。`;
    case "市集":
      return `${distanceText}适合生成观察、购买或街头互动目标。`;
    case "公园":
      return `${distanceText}适合作为轻探索和休整节点。`;
    default:
      return `${distanceText}适合触发城市探索支线。`;
  }
}

function createLocalPois(latitude: number, longitude: number): NearbyPoi[] {
  return [
    {
      id: "local-poi-arcade",
      name: "骑楼旧巷",
      category: "小巷",
      latitude: Number((latitude + 0.0011).toFixed(6)),
      longitude: Number((longitude + 0.0014).toFixed(6)),
      reason: "未配置高德 API Key，使用本地开发 POI。"
    },
    {
      id: "local-poi-tea",
      name: "街坊茶楼",
      category: "老字号",
      latitude: Number((latitude + 0.0018).toFixed(6)),
      longitude: Number((longitude - 0.0007).toFixed(6)),
      reason: "未配置高德 API Key，使用本地开发 POI。"
    },
    {
      id: "local-poi-heritage",
      name: "青砖老墙",
      category: "古迹",
      latitude: Number((latitude - 0.0008).toFixed(6)),
      longitude: Number((longitude + 0.001).toFixed(6)),
      reason: "未配置高德 API Key，使用本地开发 POI。"
    }
  ];
}
