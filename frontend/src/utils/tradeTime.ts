import type { Trade } from '../types/trade';

function parseMs(ts: string | undefined | null): number {
  if (!ts) return 0;
  const ms = new Date(ts).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Prefer execution time for any time-window logic.
 * Falls back to event time only if execution time is missing/invalid.
 */
export function getTradeExecutionMs(trade: Pick<Trade, 'execution_timestamp' | 'event_timestamp'>): number {
  const exec = parseMs(trade.execution_timestamp);
  if (exec) return exec;
  return parseMs(trade.event_timestamp);
}

