import logger from '../utils/logger';

interface ApiCall {
  timestamp: Date;
  cost: number;
}

interface AnthropicCallData {
  inputTokens: number;
  outputTokens: number;
  cost: number;
  timestamp: Date;
}

interface CostData {
  anthropic: {
    calls: number;
    inputTokens: number;
    outputTokens: number;
    cost: number;
  };
  serpapi: {
    calls: number;
    cost: number;
  };
  total: number;
  date: string;
}

/**
 * Cost Tracker Service
 * Tracks API costs for Anthropic Claude and SerpAPI
 * Resets daily at midnight
 */
class CostTrackerService {
  private currentDate: string;
  private anthropicCalls: AnthropicCallData[] = [];
  private serpApiCalls: ApiCall[] = [];

  // Pricing constants
  private readonly ANTHROPIC_INPUT_PRICE = 3 / 1_000_000; // $3 per million input tokens
  private readonly ANTHROPIC_OUTPUT_PRICE = 15 / 1_000_000; // $15 per million output tokens
  private readonly SERPAPI_PRICE = 0.01; // $0.01 per search

  constructor() {
    this.currentDate = this.getTodayDateString();
    this.resetIfNewDay();
  }

  /**
   * Get today's date as a string (YYYY-MM-DD)
   */
  private getTodayDateString(): string {
    const today = new Date();
    return today.toISOString().split('T')[0];
  }

  /**
   * Check if it's a new day and reset if needed
   */
  resetIfNewDay(): void {
    const today = this.getTodayDateString();
    if (today !== this.currentDate) {
      logger.info('Cost tracker: New day detected, resetting counters', {
        oldDate: this.currentDate,
        newDate: today,
      });
      this.currentDate = today;
      this.anthropicCalls = [];
      this.serpApiCalls = [];
    }
  }

  /**
   * Record an Anthropic API call with token usage
   */
  recordAnthropicCall(inputTokens: number, outputTokens: number): void {
    this.resetIfNewDay();

    const cost = this.calculateAnthropicCost(inputTokens, outputTokens);

    this.anthropicCalls.push({
      inputTokens,
      outputTokens,
      cost,
      timestamp: new Date(),
    });

    logger.debug('Cost tracker: Anthropic API call recorded', {
      inputTokens,
      outputTokens,
      cost: cost.toFixed(6),
      totalCalls: this.anthropicCalls.length,
    });
  }

  /**
   * Record a SerpAPI search call
   */
  recordSerpApiCall(): void {
    this.resetIfNewDay();

    this.serpApiCalls.push({
      timestamp: new Date(),
      cost: this.SERPAPI_PRICE,
    });

    logger.debug('Cost tracker: SerpAPI call recorded', {
      cost: this.SERPAPI_PRICE.toFixed(4),
      totalCalls: this.serpApiCalls.length,
    });
  }

  /**
   * Calculate cost for Anthropic API call based on token counts
   */
  private calculateAnthropicCost(inputTokens: number, outputTokens: number): number {
    const inputCost = inputTokens * this.ANTHROPIC_INPUT_PRICE;
    const outputCost = outputTokens * this.ANTHROPIC_OUTPUT_PRICE;
    return inputCost + outputCost;
  }

  /**
   * Get today's cost summary
   */
  getTodayCosts(): CostData {
    this.resetIfNewDay();

    const anthropicCost = this.anthropicCalls.reduce((sum, call) => sum + call.cost, 0);
    const anthropicInputTokens = this.anthropicCalls.reduce((sum, call) => sum + call.inputTokens, 0);
    const anthropicOutputTokens = this.anthropicCalls.reduce((sum, call) => sum + call.outputTokens, 0);

    const serpApiCost = this.serpApiCalls.reduce((sum, call) => sum + call.cost, 0);

    const totalCost = anthropicCost + serpApiCost;

    return {
      anthropic: {
        calls: this.anthropicCalls.length,
        inputTokens: anthropicInputTokens,
        outputTokens: anthropicOutputTokens,
        cost: parseFloat(anthropicCost.toFixed(6)),
      },
      serpapi: {
        calls: this.serpApiCalls.length,
        cost: parseFloat(serpApiCost.toFixed(4)),
      },
      total: parseFloat(totalCost.toFixed(6)),
      date: this.currentDate,
    };
  }

  /**
   * Get detailed call history for today
   */
  getCallHistory(): {
    anthropic: AnthropicCallData[];
    serpapi: ApiCall[];
  } {
    this.resetIfNewDay();

    return {
      anthropic: this.anthropicCalls.map(call => ({
        ...call,
        cost: parseFloat(call.cost.toFixed(6)),
      })),
      serpapi: this.serpApiCalls.map(call => ({
        ...call,
        cost: parseFloat(call.cost.toFixed(4)),
      })),
    };
  }

  /**
   * Reset all counters (useful for testing)
   */
  resetCounters(): void {
    logger.info('Cost tracker: Counters manually reset');
    this.anthropicCalls = [];
    this.serpApiCalls = [];
  }
}

// Export singleton instance
export const costTracker = new CostTrackerService();
