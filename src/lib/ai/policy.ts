export const AI_ACTIONS_ENABLED = false;
export const AI_AUTOMATION_ENABLED = false;

const BLOCKED_ACTIONS = new Set(["refund", "price_publish", "provision", "auth", "order_status"]);

export function isAIActionAllowed(action: string): boolean {
  return !BLOCKED_ACTIONS.has(action) && AI_ACTIONS_ENABLED && AI_AUTOMATION_ENABLED.has(action);
}

export function safeRecommendation(action: string): "review" | "manual_review" {
  return isAIActionAllowed(action) ? "review" : "manual_review";
}
