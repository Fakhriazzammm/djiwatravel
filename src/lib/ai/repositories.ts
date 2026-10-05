import type { AIInsight } from "./contracts";

export interface AIInsightRepository {
  save(insight: AIInsight): Promise<AIInsight>;
  list(module?: string): Promise<AIInsight[]>;
}

export class InMemoryAIInsightRepository implements AIInsightRepository {
  private readonly items: AIInsight[] = [];

  async save(insight: AIInsight): Promise<AIInsight> {
    this.items.push(insight);
    return insight;
  }

  async list(module?: string): Promise<AIInsight[]> {
    return module ? this.items.filter((item) => item.module === module) : [...this.items];
  }
}
