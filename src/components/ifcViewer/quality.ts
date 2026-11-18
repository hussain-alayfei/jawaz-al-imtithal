/*
 * Quality tiers for a demand-rendered viewer. Frames only arrive while something moves (orbit,
 * glide), so frame time is judged on bursts of consecutive frames (the caller feeds only frames
 * that followed a request for another frame; `gapMs` is a last guard against a stray idle gap).
 * When the median of a full window of burst frames is slower than `downMs`, the tier steps down
 * once and the window restarts. It never steps back up, so the picture does not flip between tiers
 * while the visitor works.
 *
 *   high:   ambient occlusion (N8AO, half resolution) + MSAA, DPR up to 1.5
 *   medium: direct render with MSAA, DPR up to 1.5
 *   low:    direct render, DPR 1
 */

export type Tier = "high" | "medium" | "low";

export const TIER_ORDER: readonly Tier[] = ["high", "medium", "low"];

export interface GovernorOptions {
  window: number;
  downMs: number;
  gapMs: number;
}

export const DEFAULT_GOVERNOR: GovernorOptions = { window: 24, downMs: 40, gapMs: 250 };

export class FrameGovernor {
  private samples: number[] = [];
  tier: Tier;

  constructor(
    start: Tier = "high",
    private readonly options: GovernorOptions = DEFAULT_GOVERNOR,
  ) {
    this.tier = start;
  }

  /** Feeds one frame delta (ms); returns the new tier when it changed. */
  push(deltaMs: number): Tier | undefined {
    if (!(deltaMs > 0) || deltaMs > this.options.gapMs) {
      // Idle gap (demand frame loop) or a bogus delta: the next frames start a new burst.
      return undefined;
    }
    this.samples.push(deltaMs);
    if (this.samples.length < this.options.window) return undefined;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    this.samples = [];
    const at = TIER_ORDER.indexOf(this.tier);
    if (median > this.options.downMs && at < TIER_ORDER.length - 1) {
      this.tier = TIER_ORDER[at + 1];
      return this.tier;
    }
    return undefined;
  }
}

/** `?quality=high|medium|low` pins a tier (captures, debugging); anything else lets the governor decide. */
export function pinnedTier(search: string): Tier | undefined {
  const q = new URLSearchParams(search).get("quality");
  return q === "high" || q === "medium" || q === "low" ? q : undefined;
}
