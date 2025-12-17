/**
 * Blotter component for real-time trade display.
 * 
 * This component displays trades in a table format with:
 * - Real-time updates via WebSocket
 * - Advanced filtering (Action, Tenor, Forward/Spot, Strategy Type, Platform, Tenor Pair)
 * - Column visibility customization (persisted in localStorage)
 * - Trade grouping (trades with same timestamp/underlying)
 * - Auto-scroll with highlighting for new trades
 * - Fixed column widths for consistent layout
 * 
 * The blotter groups trades by strategy when available (from API pre-classification).
 */

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Trade, Strategy } from '../types/trade';
import TradeRow from './TradeRow';
import StrategyRow from './StrategyRow';
import ColumnSelector from './ColumnSelector';

/**
 * Props for the Blotter component.
 */
interface BlotterProps {
  /** Array of trades to display */
  trades: Trade[];
  /** Optional array of detected strategies */
  strategies?: Strategy[];
}

/**
 * Configuration for a table column.
 */
export interface ColumnConfig {
  id: string;
  label: string;
  visible: boolean;
  width: number; // Width in pixels or flex value
}

const DEFAULT_COLUMNS: ColumnConfig[] = [
  { id: 'time', label: 'Time', visible: true, width: 110 },
  { id: 'action', label: 'Action', visible: true, width: 90 },
  { id: 'underlying', label: 'Underlying', visible: true, width: 200 },
  { id: 'notional', label: 'Notional', visible: true, width: 140 },
  { id: 'tenor', label: 'Instrument', visible: true, width: 100 },  // Renamed from "Tenor" to "Instrument"
  { id: 'rate', label: 'Rate', visible: true, width: 120 },
  { id: 'package', label: 'Package', visible: true, width: 100 },
  { id: 'strategy', label: 'Strategy', visible: true, width: 220 },
  { id: 'platform', label: 'Platform', visible: true, width: 110 },
  { id: 'eur', label: 'EUR', visible: true, width: 120 },
  { id: 'id', label: 'ID', visible: false, width: 250 },
  { id: 'currency', label: 'Currency', visible: false, width: 130 },
  { id: 'maturity', label: 'Maturity', visible: false, width: 130 },
];

export default function Blotter({ trades, strategies = [] }: BlotterProps) {
  const [searchTerm, setSearchTerm] = useState('');
  
  // Additional filters
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [tenorFilter, setTenorFilter] = useState<string>('all');
  const [forwardSpotFilter, setForwardSpotFilter] = useState<string>('all'); // all, forward, spot
  const [strategyTypeFilter, setStrategyTypeFilter] = useState<string>('all'); // all, outright, spread, butterfly, curve
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());
  const [expandedTrades, setExpandedTrades] = useState<Set<string>>(new Set());
  const [expandedStrategies, setExpandedStrategies] = useState<Set<string>>(new Set());
  const [columns, setColumns] = useState<ColumnConfig[]>(() => {
    const saved = localStorage.getItem('blotter-columns');
    return saved ? JSON.parse(saved) : DEFAULT_COLUMNS;
  });
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const prevTradeIdsRef = useRef<Set<string>>(new Set());
  const [draggedColumn, setDraggedColumn] = useState<number | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<number | null>(null);

  // Save columns to localStorage when changed
  useEffect(() => {
    localStorage.setItem('blotter-columns', JSON.stringify(columns));
  }, [columns]);

  // Helper function to sort instruments (using instrumentSort utility)
  const sortInstruments = (instruments: string[]): string[] => {
    const instrumentOrder = ["3M", "6M", "1Y", "2Y", "3Y", "5Y", "7Y", "10Y", "15Y", "20Y", "30Y"];
    return instruments.sort((a, b) => {
      // Extract base instrument for sorting (e.g., "10Y" from "5Y10Y")
      const baseA = a.split('/')[0] || a;
      const baseB = b.split('/')[0] || b;
      const indexA = instrumentOrder.indexOf(baseA);
      const indexB = instrumentOrder.indexOf(baseB);
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });
  };

  // Get unique values for filters
  const uniqueActions = useMemo(() => 
    Array.from(new Set(trades.map(t => t.action_type).filter(Boolean))).sort(),
    [trades]
  );

  const uniqueInstruments = useMemo(() => {
    const instruments = Array.from(new Set(trades.map(t => t.instrument).filter((t): t is string => Boolean(t))));
    return sortInstruments(instruments);
  }, [trades]);

  const uniquePlatforms = useMemo(() => 
    Array.from(new Set(trades.map(t => t.platform_identifier).filter(Boolean))).sort(),
    [trades]
  );

  // Filter trades
  const filteredTrades = useMemo(() => {
    let filtered = trades;
    
    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(trade => 
        trade.unique_product_identifier_underlier_name?.toLowerCase().includes(term) ||
        trade.strategy_id?.toLowerCase().includes(term) ||
        trade.dissemination_identifier.toLowerCase().includes(term)
      );
    }
    
    // Action filter
    if (actionFilter !== 'all') {
      filtered = filtered.filter(t => t.action_type === actionFilter);
    }
    
    // Instrument filter
    if (tenorFilter !== 'all') {
      filtered = filtered.filter(t => t.instrument === tenorFilter);
    }
    
    // Forward/Spot filter
    if (forwardSpotFilter === 'forward') {
      filtered = filtered.filter(t => t.is_forward);
    } else if (forwardSpotFilter === 'spot') {
      filtered = filtered.filter(t => !t.is_forward);
    }
    
    // Strategy Type filter
    if (strategyTypeFilter !== 'all') {
      if (strategyTypeFilter === 'outright') {
        // Outright: no package, no strategy (directional trades)
        filtered = filtered.filter(t => !t.package_indicator && !t.strategy_id);
      } else if (strategyTypeFilter === 'multiline_compression') {
        // Multiline Compression: package but no strategy detected
        filtered = filtered.filter(t => t.package_indicator && !t.strategy_id);
      } else {
        // Other strategy types: spread, butterfly, curve
        filtered = filtered.filter(t => {
          if (!t.strategy_id) return false;
          const strategy = strategies.find(s => s.strategy_id === t.strategy_id);
          if (!strategy) return false;
          const baseType = strategy.strategy_type.split(' ').pop()?.toLowerCase();
          return baseType === strategyTypeFilter;
        });
      }
    }
    
    // Platform filter
    if (platformFilter !== 'all') {
      filtered = filtered.filter(t => t.platform_identifier === platformFilter);
    }
    
    return filtered;
  }, [trades, searchTerm, actionFilter, tenorFilter, forwardSpotFilter, 
      strategyTypeFilter, platformFilter, strategies]);

  // Calculate visible columns
  const visibleColumns = useMemo(() => {
    return columns.filter(col => col.visible);
  }, [columns]);

  // Highlight new trades
  useEffect(() => {
    const prev = prevTradeIdsRef.current;
    const next = new Set(trades.map(t => t.dissemination_identifier));
    const newlyAdded: string[] = [];

    for (const id of next) {
      if (!prev.has(id)) newlyAdded.push(id);
    }

    if (newlyAdded.length > 0) {
      setHighlightedIds(new Set(newlyAdded));
      setTimeout(() => setHighlightedIds(new Set()), 3000);
    }

    prevTradeIdsRef.current = next;
  }, [trades]);

  const toggleExpand = useCallback((tradeId: string) => {
    setExpandedTrades(prev => {
      const next = new Set(prev);
      if (next.has(tradeId)) {
        next.delete(tradeId);
      } else {
        next.add(tradeId);
      }
      return next;
    });
  }, []);

  const toggleStrategyExpand = useCallback((strategyId: string) => {
    setExpandedStrategies(prev => {
      const next = new Set(prev);
      if (next.has(strategyId)) {
        next.delete(strategyId);
      } else {
        next.add(strategyId);
      }
      return next;
    });
  }, []);

  // Drag & Drop handlers for columns
  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDraggedColumn(index);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverColumn(index);
  }, []);

  const handleDragEnd = useCallback(() => {
    if (draggedColumn !== null && dragOverColumn !== null && draggedColumn !== dragOverColumn) {
      const newColumns = [...columns];
      const [removed] = newColumns.splice(draggedColumn, 1);
      newColumns.splice(dragOverColumn, 0, removed);
      setColumns(newColumns);
    }
    setDraggedColumn(null);
    setDragOverColumn(null);
  }, [draggedColumn, dragOverColumn, columns]);

  const strategiesById = useMemo(() => {
    return new Map(strategies.map(s => [s.strategy_id, s]));
  }, [strategies]);

  // Display trades in current order (already newest-first from cache),
  // but group strategy legs efficiently (no O(n^2) filters).
  const displayTrades = useMemo(() => {
    const strategyTrades = new Map<string, Trade[]>();
    for (const t of filteredTrades) {
      if (t.strategy_id && strategiesById.has(t.strategy_id)) {
        if (!strategyTrades.has(t.strategy_id)) strategyTrades.set(t.strategy_id, []);
        strategyTrades.get(t.strategy_id)!.push(t);
      }
    }

    const emittedStrategies = new Set<string>();
    const result: (Trade | { type: 'strategy'; strategy: Strategy; trades: Trade[] })[] = [];

    for (const t of filteredTrades) {
      const sid = t.strategy_id;
      if (sid && strategiesById.has(sid)) {
        if (emittedStrategies.has(sid)) continue;
        emittedStrategies.add(sid);
        result.push({ type: 'strategy', strategy: strategiesById.get(sid)!, trades: strategyTrades.get(sid)! });
      } else {
        result.push(t);
      }
    }

    return result;
  }, [filteredTrades, strategiesById]);


  return (
    <div className="flex flex-col h-full bg-white">
      {/* Toolbar */}
      <div className="px-6 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between gap-4 mb-2">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search by underlying, strategy ID, or trade ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50/60"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-sm font-medium text-gray-700"
          >
            {showFilters ? '▲' : '▼'} Filters
          </button>
          <button
            onClick={() => setShowColumnSelector(!showColumnSelector)}
            className="px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-sm font-medium text-gray-700"
          >
            Columns
          </button>
        </div>
        
        {/* Expandable Filters */}
        {showFilters && (
          <div className="grid grid-cols-6 gap-3 pt-3 border-t border-gray-300">
            {/* Action Filter */}
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="all">All Actions</option>
              {uniqueActions.map(action => (
                <option key={action} value={action}>{action}</option>
              ))}
            </select>
            
            {/* Instrument Filter */}
            <select
              value={tenorFilter}
              onChange={(e) => setTenorFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="all">All Instruments</option>
              {uniqueInstruments.map(instrument => (
                <option key={instrument} value={instrument}>{instrument}</option>
              ))}
            </select>
            
            {/* Forward/Spot Filter */}
            <select
              value={forwardSpotFilter}
              onChange={(e) => setForwardSpotFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="all">All Trades</option>
              <option value="spot">Spot</option>
              <option value="forward">Forward</option>
            </select>
            
            {/* Strategy Type Filter */}
            <select
              value={strategyTypeFilter}
              onChange={(e) => setStrategyTypeFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="all">All Strategies</option>
              <option value="outright">Outright</option>
              <option value="multiline_compression">Multiline Compression</option>
              <option value="spread">Spread</option>
              <option value="butterfly">Butterfly</option>
              <option value="curve">Curve</option>
            </select>
            
            {/* Platform Filter */}
            <select
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="all">All Platforms</option>
              {uniquePlatforms.map(platform => (
                <option key={platform} value={platform}>{platform}</option>
              ))}
            </select>
          </div>
        )}
        
        {/* Column Selector */}
        {showColumnSelector && (
          <div className="mt-3">
            <ColumnSelector
              columns={columns}
              onColumnsChange={setColumns}
              onClose={() => setShowColumnSelector(false)}
            />
          </div>
        )}
      </div>

      {/* Table Container with Fixed Width Columns */}
      <div className="flex-1 overflow-auto bg-gray-50">
        {displayTrades.length > 0 ? (
          <div className="bg-white">
            {/* Table Header */}
            <div className="sticky top-0 z-10 bg-gradient-to-r from-gray-100 to-gray-50 border-b-2 border-gray-300 shadow-sm">
            <table className="w-full border-collapse" style={{ tableLayout: 'fixed', width: '100%' }}>
              <colgroup>
                {visibleColumns.map(col => (
                  <col key={col.id} style={{ width: `${col.width}px`, minWidth: `${col.width}px`, maxWidth: `${col.width}px` }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {visibleColumns.map((col, index) => (
                    <th
                      key={col.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDragEnd={handleDragEnd}
                      className={`px-3 py-3 text-left text-xs font-bold text-gray-800 uppercase tracking-wide border-r border-gray-300 bg-gray-100 overflow-hidden cursor-move transition-all ${
                        draggedColumn === index ? 'opacity-50' : ''
                      } ${
                        dragOverColumn === index && draggedColumn !== index ? 'border-l-4 border-l-blue-500' : ''
                      }`}
                      style={{ width: `${col.width}px`, maxWidth: `${col.width}px` }}
                      title="Drag to reorder columns"
                    >
                      <div className="truncate flex items-center gap-1">
                        <span className="text-gray-400">⋮⋮</span>
                        {col.label}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              </table>
            </div>

            {/* Table Body */}
            <table className="w-full border-collapse" style={{ tableLayout: 'fixed', width: '100%' }}>
              <colgroup>
                {visibleColumns.map(col => (
                  <col key={col.id} style={{ width: `${col.width}px` }} />
                ))}
              </colgroup>
              <tbody>
                {displayTrades.map((item) => {
                  // Check if this is a strategy group
                  if ('type' in item && item.type === 'strategy') {
                    const { strategy, trades } = item;
                    const isExpanded = expandedStrategies.has(strategy.strategy_id);
                    const isHighlighted = trades.some(t => highlightedIds.has(t.dissemination_identifier));
                    
                    return (
                      <StrategyRow
                        key={`strategy-${strategy.strategy_id}`}
                        strategy={strategy}
                        trades={trades}
                        highlighted={isHighlighted}
                        isExpanded={isExpanded}
                        onToggleExpand={() => toggleStrategyExpand(strategy.strategy_id)}
                        visibleColumns={visibleColumns}
                        strategies={strategies}
                      />
                    );
                  }
                  
                  // Regular trade
                  const trade = item as Trade;
                  const isHighlighted = highlightedIds.has(trade.dissemination_identifier);
                  const isExpanded = expandedTrades.has(trade.dissemination_identifier);
                  const hasLegs = trade.package_indicator && trade.package_legs && trade.package_legs.length > 0;
                  
                  return (
                    <TradeRow
                      key={trade.dissemination_identifier}
                      trade={trade}
                      highlighted={isHighlighted}
                      isExpanded={isExpanded}
                      hasLegs={hasLegs}
                      onToggleExpand={() => toggleExpand(trade.dissemination_identifier)}
                      visibleColumns={visibleColumns}
                      strategies={strategies}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <div className="text-4xl mb-2">📊</div>
              <div className="text-lg font-medium">No trades found</div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-2 bg-gray-50 border-t border-gray-200 text-sm text-gray-600 flex items-center justify-between">
        <div>
          Showing <span className="font-semibold">{filteredTrades.length}</span> of <span className="font-semibold">{trades.length}</span> trades
        </div>
        <div className="text-xs text-gray-500">
          {expandedTrades.size > 0 && `${expandedTrades.size} package${expandedTrades.size > 1 ? 's' : ''} expanded`}
          {expandedStrategies.size > 0 && ` | ${expandedStrategies.size} strateg${expandedStrategies.size > 1 ? 'ies' : 'y'} expanded`}
        </div>
      </div>
    </div>
  );
}
