export const TRAFFIC_RANGES = ["24j", "7h", "30h", "all"] as const;
export type TrafficRange = (typeof TRAFFIC_RANGES)[number];
export const TRAFFIC_RANGE_LABEL: Record<TrafficRange, string> = {
  "24j": "24 jam",
  "7h": "7 hari",
  "30h": "30 hari",
  all: "Semua",
};

export type Named = { label: string; value: number; tag?: string };
export type Point = { label: string; value: number };

export type TrafficKinds = {
  people: number;
  aiAnswers: number;
  aiCrawl: number;
  searchEngine: number;
};

export type TrafficDashboard = {
  range: TrafficRange;
  updatedAt: string;
  since: string | null;
  live: { online: number; paths: Named[] };
  total24h: TrafficKinds;
  totalAll: TrafficKinds;
  people: { views24h: number; visitors24h: number; viewsAll: number };
  ai: { answers24h: number; crawls24h: number; answersAll: number };
  series: { people: Point[]; aiAnswers: Point[]; aiClicks: Point[]; revenue: Point[] };
  pages: Named[];
  referrers: Named[];
  channels: Named[];
  devices: Named[];
  assistants: Named[];
  aiPages: Named[];
  crawlers: Named[];
  kinds: {
    aiAnswers: number;
    aiClicks: number;
    aiCrawl: number;
    aiTrain: number;
    searchEngine: number;
  };
  notCounted: number;
  sales: {
    revenue: number;
    previousRevenue: number;
    orders: number;
    previousOrders: number;
    aov: number;
    visitors: number;
    conversionPct: number | null;
    funnel: Named[];
    byProduct: (Named & { orders: number })[];
    bySource: (Named & { orders: number })[];
    byPage: (Named & { orders: number })[];
    recent: {
      at: string;
      label: string;
      source: string;
      status: string;
      amount: number;
    }[];
    actions: { label: string; value: number; href: string }[];
  };
};
