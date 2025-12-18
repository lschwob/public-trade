/**
 * Blotter component for real-time strategy and trade display.
 * 
 * This component displays strategies in a table format with:
 * - Real-time updates via WebSocket
 * - Advanced filtering (Product Type, Tenor, Instrument, Platform)
 * - Column visibility customization (persisted in localStorage)
 * - Expandable strategies showing all legs with full data
 * - Auto-scroll with highlighting for new strategies
 * - Fixed column widths for consistent layout
 * 
 * Each row represents a strategy from the API, expandable to show all legs.
 */

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Trade, Strategy } from '../types/trade';
import StrategyRow from './StrategyRow';
import ColumnSelector from './ColumnSelector';

/**
 * Props for the Blotter component.
 */
interface BlotterProps {
  /** Array of trades to display (for backward compatibility) */
  trades: Trade[];
  /** Array of strategies to display */
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
  { id: 'time', label: 'Exec Time', visible: true, width: 110 },
  { id: 'product', label: 'Product', visible: true, width: 130 },
  { id: 'underlying', label: 'Underlier', visible: true, width: 180 },
  { id: 'tenor', label: 'Tenor', visible: true, width: 90 },
  { id: 'instrument', label: 'Instrument', visible: true, width: 100 },
  { id: 'notional', label: 'Notional', visible: true, width: 130 },
  { id: 'legs', label: 'Legs', visible: true, width: 80 },
  { id: 'price', label: 'Price', visible: true, width: 100 },
  { id: 'ironPrice', label: 'Iron Price', visible: true, width: 100 },
  { id: 'platform', label: 'Platform', visible: true, width: 110 },
  { id: 'd2c', label: 'D2C', visible: true, width: 60 },
  { id: 'id', label: 'ID', visible: false, width: 250 },
];

export default function Blotter({ trades: _trades, strategies = [] }: BlotterProps) {
  // Note: trades parameter kept for backward compatibility but now showing strategies as main view
  void _trades; // Mark as intentionally unused
  const [searchTerm, setSearchTerm] = useState('');
  
  // Filters
  const [tenorFilter, setTenorFilter] = useState<string>('all');
  const [strategyTypeFilter, setStrategyTypeFilter] = useState<string>('all'); // all, outright, spread, butterfly, curve
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());
  const [expandedStrategies, setExpandedStrategies] = useState<Set<string>>(new Set());
  const [columns, setColumns] = useState<ColumnConfig[]>(() => {
    const saved = localStorage.getItem('blotter-columns');
    if (!saved) return DEFAULT_COLUMNS;
    try {
      const parsed = JSON.parse(saved) as ColumnConfig[];

      // Migration:
      // - older versions used id 'tenor' to display maturity instrument
      // - new versions split into {tenor} (index tenor) and {instrument} (maturity)
      const migrated = parsed.map((c) => {
        if (c.id === 'tenor' && (c.label === 'Instrument' || c.label === 'Tenor')) {
          // If there's already an 'instrument' column in saved state, keep as-is.
          // Otherwise repurpose old 'tenor' into 'instrument'.
          const hasInstrument = parsed.some(x => x.id === 'instrument');
          if (!hasInstrument) {
            return { ...c, id: 'instrument', label: 'Instrument' };
          }
        }
        return c;
      });

      const byId = new Map(migrated.map(c => [c.id, c]));
      const ensure = (id: string) => {
        if (!byId.has(id)) {
          const def = DEFAULT_COLUMNS.find(c => c.id === id);
          if (def) byId.set(id, def);
        }
      };

      ensure('tenor');
      ensure('instrument');

      // Keep saved order, then append any new defaults not present
      const ordered: ColumnConfig[] = [];
      const seen = new Set<string>();
      for (const c of migrated) {
        if (!seen.has(c.id)) {
          ordered.push(c);
          seen.add(c.id);
        }
      }
      for (const def of DEFAULT_COLUMNS) {
        if (!seen.has(def.id)) ordered.push(def);
      }

      // If tenor was newly inserted, place it right after underlying for UX
      const hasTenor = ordered.some(c => c.id === 'tenor');
      if (hasTenor) {
        const idxUnderlying = ordered.findIndex(c => c.id === 'underlying');
        const idxTenor = ordered.findIndex(c => c.id === 'tenor');
        if (idxUnderlying >= 0 && idxTenor >= 0 && idxTenor !== idxUnderlying + 1) {
          const [tenorCol] = ordered.splice(idxTenor, 1);
          ordered.splice(idxUnderlying + 1, 0, tenorCol);
        }
      }

      return ordered;
    } catch {
      return DEFAULT_COLUMNS;
    }
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

  // Get unique values for filters from strategies
  const uniqueProducts = useMemo(() => 
    Array.from(new Set(strategies.map(s => s.product || s.strategy_type).filter(Boolean))).sort(),
    [strategies]
  );

  const uniqueInstruments = useMemo(() => {
    const instruments = Array.from(new Set(strategies.map(s => s.instrument).filter((t): t is string => Boolean(t))));
    return sortInstruments(instruments);
  }, [strategies]);

  const uniquePlatforms = useMemo(() => 
    Array.from(new Set(strategies.map(s => s.platform).filter(Boolean))).sort(),
    [strategies]
  );


  // Calculate visible columns
  const visibleColumns = useMemo(() => {
    return columns.filter(col => col.visible);
  }, [columns]);

  // Highlight new strategies
  useEffect(() => {
    const prev = prevTradeIdsRef.current;
    const next = new Set(strategies.map(s => s.strategy_id));
    const newlyAdded: string[] = [];

    for (const id of next) {
      if (!prev.has(id)) newlyAdded.push(id);
    }

    if (newlyAdded.length > 0) {
      setHighlightedIds(new Set(newlyAdded));
      setTimeout(() => setHighlightedIds(new Set()), 3000);
    }

    prevTradeIdsRef.current = next;
  }, [strategies]);

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

  // Filter strategies based on filters
  const filteredStrategies = useMemo(() => {
    let filtered = strategies;
    
    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(strategy => 
        (strategy.underlying_name || strategy.underlier || '').toLowerCase().includes(term) ||
        strategy.strategy_id.toLowerCase().includes(term) ||
        (strategy.product || strategy.strategy_type || '').toLowerCase().includes(term) ||
        (strategy.instrument || '').toLowerCase().includes(term)
      );
    }
    
    // Product/Strategy Type filter (was strategyTypeFilter)
    if (strategyTypeFilter !== 'all') {
      filtered = filtered.filter(s => {
        const type = (s.product || s.strategy_type || '').toLowerCase();
        if (strategyTypeFilter === 'outright') return type === 'outright' || (s.legs_count || s.legsCount || 0) === 1;
        if (strategyTypeFilter === 'spread') return type.includes('spread');
        if (strategyTypeFilter === 'butterfly') return type.includes('butterfly');
        if (strategyTypeFilter === 'curve') return type.includes('curve');
        return type === strategyTypeFilter;
      });
    }
    
    // Instrument filter
    if (tenorFilter !== 'all') {
      filtered = filtered.filter(s => s.instrument === tenorFilter);
    }
    
    // Platform filter
    if (platformFilter !== 'all') {
      filtered = filtered.filter(s => s.platform === platformFilter);
    }
    
    return filtered;
  }, [strategies, searchTerm, strategyTypeFilter, tenorFilter, platformFilter]);

  // Create display items - strategies sorted by execution time (newest first)
  const displayItems = useMemo(() => {
    // Sort strategies by execution time (newest first)
    return [...filteredStrategies].sort((a, b) => {
      const timeA = new Date(a.executionDateTime || a.execution_date_time || a.execution_start || 0).getTime();
      const timeB = new Date(b.executionDateTime || b.execution_date_time || b.execution_start || 0).getTime();
      return timeB - timeA;
    });
  }, [filteredStrategies]);


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
          <div className="grid grid-cols-4 gap-3 pt-3 border-t border-gray-300">
            {/* Product/Strategy Type Filter */}
            <select
              value={strategyTypeFilter}
              onChange={(e) => setStrategyTypeFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="all">All Products</option>
              <option value="outright">Outright</option>
              <option value="spread">Spread</option>
              <option value="butterfly">Butterfly</option>
              <option value="curve">Curve</option>
              {uniqueProducts.filter(p => 
                !['outright', 'spread', 'butterfly', 'curve'].includes(p?.toLowerCase() || '')
              ).map(product => (
                <option key={product} value={product}>{product}</option>
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
        {displayItems.length > 0 ? (
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
                {displayItems.map((strategy) => {
                  const isExpanded = expandedStrategies.has(strategy.strategy_id);
                  const isHighlighted = highlightedIds.has(strategy.strategy_id);
                  
                  return (
                    <StrategyRow
                      key={`strategy-${strategy.strategy_id}`}
                      strategy={strategy}
                      highlighted={isHighlighted}
                      isExpanded={isExpanded}
                      onToggleExpand={() => toggleStrategyExpand(strategy.strategy_id)}
                      visibleColumns={visibleColumns}
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
              <div className="text-lg font-medium">No strategies found</div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-2 bg-gray-50 border-t border-gray-200 text-sm text-gray-600 flex items-center justify-between">
        <div>
          Showing <span className="font-semibold">{filteredStrategies.length}</span> of <span className="font-semibold">{strategies.length}</span> strategies
        </div>
        <div className="text-xs text-gray-500">
          {expandedStrategies.size > 0 && `${expandedStrategies.size} strateg${expandedStrategies.size > 1 ? 'ies' : 'y'} expanded`}
        </div>
      </div>
    </div>
  );
}
