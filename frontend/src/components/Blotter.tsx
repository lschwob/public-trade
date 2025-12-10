import { useState, useMemo, useEffect, useRef } from 'react';
import { Trade, Strategy } from '../types/trade';
import TradeRow from './TradeRow';
import ColumnSelector from './ColumnSelector';

interface BlotterProps {
  trades: Trade[];
  strategies?: Strategy[];
}

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
  { id: 'tenor', label: 'Tenor', visible: true, width: 80 },
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
  const [tenorPairFilter, setTenorPairFilter] = useState<string>('all');
  
  // Additional filters
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [tenorFilter, setTenorFilter] = useState<string>('all');
  const [forwardSpotFilter, setForwardSpotFilter] = useState<string>('all'); // all, forward, spot
  const [strategyTypeFilter, setStrategyTypeFilter] = useState<string>('all'); // all, outright, spread, butterfly, curve
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());
  const [expandedTrades, setExpandedTrades] = useState<Set<string>>(new Set());
  const [columns, setColumns] = useState<ColumnConfig[]>(() => {
    const saved = localStorage.getItem('blotter-columns');
    return saved ? JSON.parse(saved) : DEFAULT_COLUMNS;
  });
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const prevTradesLengthRef = useRef(0);

  // Save columns to localStorage when changed
  useEffect(() => {
    localStorage.setItem('blotter-columns', JSON.stringify(columns));
  }, [columns]);

  // Helper function to sort tenors
  const sortTenors = (tenors: string[]): string[] => {
    const tenorOrder = ["3M", "6M", "1Y", "2Y", "3Y", "5Y", "7Y", "10Y", "15Y", "20Y", "30Y"];
    return tenors.sort((a, b) => {
      const indexA = tenorOrder.indexOf(a);
      const indexB = tenorOrder.indexOf(b);
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

  const uniqueTenors = useMemo(() => {
    const tenors = Array.from(new Set(trades.map(t => t.tenor).filter((t): t is string => Boolean(t))));
    return sortTenors(tenors);
  }, [trades]);

  const uniquePlatforms = useMemo(() => 
    Array.from(new Set(trades.map(t => t.platform_identifier).filter(Boolean))).sort(),
    [trades]
  );

  // Get unique tenor pairs from strategies
  const uniqueTenorPairs = useMemo(() => {
    const pairs = Array.from(
      new Set(strategies.map(s => s.tenor_pair).filter(Boolean))
    ).sort();
    return pairs;
  }, [strategies]);

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
    
    // Tenor filter
    if (tenorFilter !== 'all') {
      filtered = filtered.filter(t => t.tenor === tenorFilter);
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
    
    // Tenor Pair filter (existing)
    if (tenorPairFilter !== 'all') {
      filtered = filtered.filter(trade => {
        if (!trade.strategy_id) return false;
        const strategy = strategies.find(s => s.strategy_id === trade.strategy_id);
        return strategy?.tenor_pair === tenorPairFilter;
      });
    }
    
    return filtered;
  }, [trades, searchTerm, actionFilter, tenorFilter, forwardSpotFilter, 
      strategyTypeFilter, platformFilter, tenorPairFilter, strategies]);

  // Calculate visible columns
  const visibleColumns = useMemo(() => {
    return columns.filter(col => col.visible);
  }, [columns]);

  // Highlight new trades
  useEffect(() => {
    if (trades.length > prevTradesLengthRef.current) {
      const newTrades = trades.slice(0, trades.length - prevTradesLengthRef.current);
      const newIds = new Set(newTrades.map(t => t.dissemination_identifier));
      setHighlightedIds(newIds);
      
      // Remove highlight after 3 seconds
      setTimeout(() => {
        setHighlightedIds(new Set());
      }, 3000);
    }
    prevTradesLengthRef.current = trades.length;
  }, [trades]);

  const toggleExpand = (tradeId: string) => {
    setExpandedTrades(prev => {
      const next = new Set(prev);
      if (next.has(tradeId)) {
        next.delete(tradeId);
      } else {
        next.add(tradeId);
      }
      return next;
    });
  };

  // Sort and display trades (most recent first)
  const displayTrades = useMemo(() => {
    const sorted = [...filteredTrades].sort((a, b) => {
      const timeA = new Date(a.execution_timestamp).getTime();
      const timeB = new Date(b.execution_timestamp).getTime();
      return timeB - timeA; // Descending (newest first)
    });
    return sorted;
  }, [filteredTrades]);


  return (
    <div className="flex flex-col h-full bg-white">
      {/* Toolbar */}
      <div className="px-6 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between gap-4 mb-2">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search by underlying, strategy ID, or trade ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium text-gray-700"
          >
            {showFilters ? '▲' : '▼'} Filters
          </button>
          <button
            onClick={() => setShowColumnSelector(!showColumnSelector)}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium text-gray-700"
          >
            ⚙️ Columns
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
            
            {/* Tenor Filter */}
            <select
              value={tenorFilter}
              onChange={(e) => setTenorFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="all">All Tenors</option>
              {uniqueTenors.map(tenor => (
                <option key={tenor} value={tenor}>{tenor}</option>
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
            
            {/* Tenor Pair Filter (existing) */}
            {uniqueTenorPairs.length > 0 && (
              <select
                value={tenorPairFilter}
                onChange={(e) => setTenorPairFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
              >
                <option value="all">All Tenor Pairs</option>
                {uniqueTenorPairs.map(pair => (
                  <option key={pair} value={pair}>{pair}</option>
                ))}
              </select>
            )}
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
                  {visibleColumns.map(col => (
                    <th
                      key={col.id}
                      className="px-3 py-3 text-left text-xs font-bold text-gray-800 uppercase tracking-wide border-r border-gray-300 bg-gray-100 overflow-hidden"
                      style={{ width: `${col.width}px`, maxWidth: `${col.width}px` }}
                    >
                      <div className="truncate">{col.label}</div>
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
                {displayTrades.map((trade) => {
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
        </div>
      </div>
    </div>
  );
}
