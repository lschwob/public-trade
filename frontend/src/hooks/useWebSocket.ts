import { useEffect, useRef, useState, useCallback } from 'react';
import { WebSocketMessage, Trade, Strategy, Alert, Analytics } from '../types/trade';

// Use environment variable or construct from current host
const getWsUrl = () => {
  const envUrl = import.meta.env.VITE_WS_URL;
  if (envUrl) return envUrl;
  // For browser, use window location to determine WebSocket URL
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.hostname;
  const port = host === 'localhost' ? ':8000' : '';
  return `${protocol}//${host}${port}/ws`;
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
          const message: WebSocketMessage = JSON.parse(event.data);
          
          switch (message.type) {
            case 'initial_state':
              if (message.data.trades) {
                setTrades(message.data.trades);
              }
              if (message.data.strategies) {
                setStrategies(message.data.strategies);
              }
              if (message.data.analytics) {
                setAnalytics(message.data.analytics);
              }
              break;
            
            case 'new_trade':
              setTrades((prev) => {
                const newTrade = message.data as Trade;
                // Check if trade already exists (update it)
                const existingIndex = prev.findIndex(
                  t => t.dissemination_identifier === newTrade.dissemination_identifier
                );
                if (existingIndex >= 0) {
                  const updated = [...prev];
                  updated[existingIndex] = newTrade;
                  return updated;
                }
                // Add new trade at the beginning
                const newTrades = [newTrade, ...prev];
                // Keep last 1000 trades
                return newTrades.slice(0, 1000);
              });
              break;
            
            case 'trade_updated':
              setTrades((prev) => {
                const updatedTrade = message.data as Trade;
                const index = prev.findIndex(
                  t => t.dissemination_identifier === updatedTrade.dissemination_identifier
                );
                if (index >= 0) {
                  const updated = [...prev];
                  updated[index] = updatedTrade;
                  return updated;
                }
                return prev;
              });
              break;
            
            case 'strategy_detected':
              setStrategies((prev) => {
                const strategy = message.data as Strategy;
                const existing = prev.findIndex(s => s.strategy_id === strategy.strategy_id);
                if (existing >= 0) {
                  const updated = [...prev];
                  updated[existing] = strategy;
                  return updated;
                }
                return [strategy, ...prev];
              });
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

