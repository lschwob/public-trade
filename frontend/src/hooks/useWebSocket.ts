import { useEffect, useRef, useState, useCallback } from 'react';
import { WebSocketMessage, Trade, Strategy, Alert, Analytics } from '../types/trade';

// Use environment variable or construct from current host
const getWsUrl = () => {
  // Check for host-specific URL first (for browser access)
  const hostUrl = import.meta.env.VITE_WS_URL_HOST;
  if (hostUrl && typeof window !== 'undefined') {
    // Use host URL when running in browser
    return hostUrl;
  }
  
  // Check for Docker internal URL
  const envUrl = import.meta.env.VITE_WS_URL;
  if (envUrl) return envUrl;
  
  // For browser, use window location to determine WebSocket URL
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    // Use port 8000 if on localhost, otherwise use same port as frontend
    const port = host === 'localhost' || host === '127.0.0.1' ? ':8000' : '';
    return `${protocol}//${host}${port}/ws`;
  }
  
  // Fallback for SSR or other environments
  return 'ws://localhost:8000/ws';
};

const WS_URL = getWsUrl();

export function useWebSocket() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number>();

  // ---------------------------------------------------------------------------
  // Trade/strategy caches: keep UI stable across reconnects and avoid full reload.
  // ---------------------------------------------------------------------------
  const MAX_TRADES = 1000;
  const tradeCacheRef = useRef<Map<string, Trade>>(new Map());
  const tradeFpRef = useRef<Map<string, string>>(new Map());
  const tradeTimeRef = useRef<Map<string, number>>(new Map());
  const tradeOrderRef = useRef<string[]>([]);

  const strategyCacheRef = useRef<Map<string, Strategy>>(new Map());
  const strategyFpRef = useRef<Map<string, string>>(new Map());

  const toTimeMs = (timestamp: string): number => {
    const ms = new Date(timestamp).getTime();
    return Number.isFinite(ms) ? ms : 0;
  };

  const fingerprintTrade = (t: Trade): string => {
    // Keep this small but representative of UI + expansion content.
    const legsIds =
      t.package_legs && t.package_legs.length > 0
        ? t.package_legs.map(l => l.dissemination_identifier).join(',')
        : '';
    return JSON.stringify([
      t.dissemination_identifier,
      t.action_type,
      t.execution_timestamp,
      t.unique_product_identifier_underlier_name ?? null,
      t.instrument ?? null,
      t.platform_identifier ?? null,
      t.is_forward,
      t.package_indicator,
      t.package_legs_count ?? null,
      legsIds,
      t.notional_amount_leg1,
      t.notional_amount_leg2,
      t.notional_currency_leg1,
      t.notional_currency_leg2,
      t.notional_eur ?? null,
      t.fixed_rate_leg1 ?? null,
      t.spread_leg2 ?? null,
      t.strategy_id ?? null,
      t.expiration_date ?? null,
    ]);
  };

  const fingerprintStrategy = (s: Strategy): string => {
    return JSON.stringify([
      s.strategy_id,
      s.strategy_type,
      s.underlying_name ?? null,
      s.total_notional_eur,
      s.execution_start,
      s.execution_end,
      s.package_transaction_price ?? null,
      s.legs?.join(',') ?? '',
    ]);
  };

  const insertSortedByTimeDesc = (order: string[], id: string, timeMs: number) => {
    // Remove if already present
    const existingIdx = order.indexOf(id);
    if (existingIdx >= 0) order.splice(existingIdx, 1);

    // Binary search insert position (desc)
    let lo = 0;
    let hi = order.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const midTime = tradeTimeRef.current.get(order[mid]) ?? 0;
      if (midTime >= timeMs) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    order.splice(lo, 0, id);
  };

  const pruneTrades = () => {
    const order = tradeOrderRef.current;
    if (order.length <= MAX_TRADES) return;
    const removed = order.splice(MAX_TRADES);
    for (const id of removed) {
      tradeCacheRef.current.delete(id);
      tradeFpRef.current.delete(id);
      tradeTimeRef.current.delete(id);
    }
  };

  const emitTradesFromCache = () => {
    const next: Trade[] = [];
    for (const id of tradeOrderRef.current) {
      const t = tradeCacheRef.current.get(id);
      if (t) next.push(t);
    }
    setTrades(next);
  };

  const emitStrategiesFromCache = () => {
    // Keep insertion order: newest first (we'll just reverse-iterate by existing array order if needed later)
    setStrategies(Array.from(strategyCacheRef.current.values()));
  };

  const upsertTrade = (trade: Trade, { allowReorder }: { allowReorder: boolean }): boolean => {
    const id = trade.dissemination_identifier;
    const fp = fingerprintTrade(trade);
    const prevFp = tradeFpRef.current.get(id);
    const timeMs = toTimeMs(trade.execution_timestamp);
    const prevTime = tradeTimeRef.current.get(id);

    const isNew = !tradeCacheRef.current.has(id);
    const hasChanged = isNew || prevFp !== fp;
    const timeChanged = prevTime !== timeMs;

    if (!hasChanged && (!allowReorder || !timeChanged)) {
      return false;
    }

    if (hasChanged) {
      tradeCacheRef.current.set(id, trade);
      tradeFpRef.current.set(id, fp);
    }
    tradeTimeRef.current.set(id, timeMs);

    if (isNew) {
      // Most new trades are newest; but keep order correct anyway.
      insertSortedByTimeDesc(tradeOrderRef.current, id, timeMs);
    } else if (allowReorder && timeChanged) {
      insertSortedByTimeDesc(tradeOrderRef.current, id, timeMs);
    }

    return true;
  };

  const upsertTrades = (incoming: Trade[], { allowReorder }: { allowReorder: boolean }): boolean => {
    let changed = false;
    for (const t of incoming) {
      if (!t?.dissemination_identifier) continue;
      if (upsertTrade(t, { allowReorder })) {
        changed = true;
      }
    }
    if (changed) {
      pruneTrades();
    }
    return changed;
  };

  const upsertStrategy = (strategy: Strategy): boolean => {
    const id = strategy.strategy_id;
    const fp = fingerprintStrategy(strategy);
    const prevFp = strategyFpRef.current.get(id);
    const isNew = !strategyCacheRef.current.has(id);
    const hasChanged = isNew || prevFp !== fp;
    if (!hasChanged) return false;
    strategyCacheRef.current.set(id, strategy);
    strategyFpRef.current.set(id, fp);
    return true;
  };

  const upsertStrategies = (incoming: Strategy[]): boolean => {
    let changed = false;
    for (const s of incoming) {
      if (!s?.strategy_id) continue;
      if (upsertStrategy(s)) changed = true;
    }
    return changed;
  };

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setConnected(true);
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
      };

      ws.onmessage = (event) => {
        try {
          // Parse and sanitize the message data
          const message: WebSocketMessage = JSON.parse(event.data);
          
          // Helper to replace NaN values with null
          const sanitizeValue = (val: any): any => {
            if (typeof val === 'number' && !isFinite(val)) {
              return null;
            }
            if (typeof val === 'object' && val !== null) {
              if (Array.isArray(val)) {
                return val.map(sanitizeValue);
              }
              const sanitized: any = {};
              for (const key in val) {
                sanitized[key] = sanitizeValue(val[key]);
              }
              return sanitized;
            }
            return val;
          };
          
          // Sanitize message data
          if (message.data) {
            message.data = sanitizeValue(message.data);
          }
          
          switch (message.type) {
            case 'initial_state':
              {
                const incomingTrades = (message.data?.trades ?? []) as Trade[];
                const incomingStrategies = (message.data?.strategies ?? []) as Strategy[];

                // Merge snapshot into cache instead of replacing state:
                // - keeps old cached trades on reconnect
                // - avoids "full reload" render
                const tradesChanged = upsertTrades(incomingTrades, { allowReorder: true });
                const strategiesChanged = upsertStrategies(incomingStrategies);

                if (tradesChanged) emitTradesFromCache();
                if (strategiesChanged) emitStrategiesFromCache();
              }
              if (message.data.analytics) {
                setAnalytics(message.data.analytics);
              }
              break;
            
            case 'new_trade':
              {
                const newTrade = message.data as Trade;
                if (upsertTrade(newTrade, { allowReorder: true })) {
                  pruneTrades();
                  emitTradesFromCache();
                }
              }
              break;
            
            case 'trade_updated':
              {
                const updatedTrade = message.data as Trade;
                // Updates should not reorder unless timestamp changed.
                if (upsertTrade(updatedTrade, { allowReorder: true })) {
                  pruneTrades();
                  emitTradesFromCache();
                }
              }
              break;
            
            case 'strategy_detected':
              {
                const strategy = message.data as Strategy;
                if (upsertStrategy(strategy)) {
                  emitStrategiesFromCache();
                }
              }
              break;
            
            case 'alert':
              setAlerts((prev) => {
                const alert = message.data as Alert;
                return [alert, ...prev].slice(0, 100); // Keep last 100 alerts
              });
              break;
            
            case 'analytics_update':
              setAnalytics(message.data as Analytics);
              break;
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnected(false);
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setConnected(false);
        // Reconnect after 3 seconds
        reconnectTimeoutRef.current = window.setTimeout(() => {
          connect();
        }, 3000);
      };
    } catch (error) {
      console.error('Error creating WebSocket:', error);
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  const dismissAlert = useCallback((alertId: string) => {
    setAlerts((prev) => prev.filter(a => a.alert_id !== alertId));
  }, []);

  const clearAlerts = useCallback(() => {
    setAlerts([]);
  }, []);

  return {
    trades,
    strategies,
    alerts,
    analytics,
    connected,
    dismissAlert,
    clearAlerts,
  };
}

