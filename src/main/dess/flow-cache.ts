/** energy-flow blocks that hold the power values. A response without them is useless. */
const BLOCKS = ['bc_status', 'gd_status', 'pv_status', 'bt_status'];

/** How long the last successful response is kept when new ones stop arriving. */
export const FLOW_STALE_MS = 3 * 60_000;

export const hasFlowData = (flow: unknown): flow is Record<string, any> =>
  !!flow && typeof flow === 'object' && BLOCKS.some((k) => Array.isArray((flow as any)[k]) && (flow as any)[k].length > 0);

/**
 * The energy-flow request occasionally fails or comes back empty. Without a fallback, the grid
 * and load powers would vanish from the diagram. The cache substitutes the last successful
 * response for a limited time.
 */
export class FlowCache {
  private last: { data: Record<string, any>; at: number } | null = null;

  resolve(raw: unknown, now = Date.now()): Record<string, any> {
    if (hasFlowData(raw)) {
      this.last = { data: raw, at: now };
      return raw;
    }
    if (this.last && now - this.last.at <= FLOW_STALE_MS) return this.last.data;
    return {};
  }

  clear() {
    this.last = null;
  }
}
