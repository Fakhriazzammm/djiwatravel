export type ResellerCatalogMetrics = {
  hits: number;
  misses: number;
  staleServed: number;
  providerRequests: number;
  providerLatencyMs: number;
  providerTimeouts: number;
  providerErrors: number;
  snapshotAgeMs: number | null;
};

const metrics: ResellerCatalogMetrics = {
  hits: 0,
  misses: 0,
  staleServed: 0,
  providerRequests: 0,
  providerLatencyMs: 0,
  providerTimeouts: 0,
  providerErrors: 0,
  snapshotAgeMs: null,
};

export function recordCatalogMetric(event: keyof ResellerCatalogMetrics, value = 1) {
  if (event === "snapshotAgeMs") metrics.snapshotAgeMs = Math.max(0, value);
  else metrics[event] += value;
}

export function getResellerCatalogMetrics(): ResellerCatalogMetrics {
  return { ...metrics };
}

export function resetResellerCatalogMetrics() {
  metrics.hits = 0;
  metrics.misses = 0;
  metrics.staleServed = 0;
  metrics.providerRequests = 0;
  metrics.providerLatencyMs = 0;
  metrics.providerTimeouts = 0;
  metrics.providerErrors = 0;
  metrics.snapshotAgeMs = null;
}
