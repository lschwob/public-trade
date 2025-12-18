/**
 * Blotter component for real-time trade display.
 * 
 * DESIGN GOALS: High-density, High-contrast, Speed.
 * - Dark header, clear data rows.
 * - Monospace numbers.
 * - minimal whitespace.
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
  align?: 'left' | 'right' | 'center';
}

const DEFAULT_COLUMNS: ColumnConfig[] = [
  { id: 'time', label: 'Time', visible: true, width: 90, align: 'left' },
  { id: 'action', label: 'Act', visible: true, width: 70, align: 'center' },
  { id: 'instrument', label: 'Tenor', visible: true, width: 80, align: 'left' },
  { id: 'underlying', label: 'Product', visible: true, width: 180, align: 'left' },
  { id: 'notional', label: 'Size (EUR)', visible: true, width: 110, align: 'right' },
  { id: 'rate', label: 'Price', visible: true, width: 90, align: 'right' },
  { id: 'strategy', label: 'Strategy', visible: true, width: 160, align: 'left' },
  { id: 'platform', label: 'Venue', visible: true, width: 80, align: 'left' },
  { id: 'package', label: 'Pkg', visible: true, width: 50, align: 'center' },
  { id: 'tenor', label: 'Tenor (Calc)', visible: false, width: 80, align: 'left' },
  { id: 'eur', label: 'Notional', visible: false, width: 100, align: 'right' },
  { id: 'id', label: 'Trade ID', visible: false, width: 180, align: 'left' },
  { id: 'currency', label: 'Ccy', visible: false, width: 60, align: 'center' },
  { id: 'maturity', label: 'Mat', visible: false, width: 90, align: 'left' },
];

export default function Blotter({ trades, strategies = [] }: BlotterProps) {
  const [searchTerm, setSearchTerm] = useState('');
  
  // Filters
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [tenorFilter, setTenorFilter] = useState<string>('all');
  const [minNotional, setMinNotional] = useState<string>('');
  const [currencyFilter, setCurrencyFilter] = useState<string>('all');
  
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());
  const [expandedTrades, setExpandedTrades] = useState<Set<string>>(new Set());
  const [expandedStrategies, setExpandedStrategies] = useState<Set<string>>(new Set());
  const [columns, setColumns] = useState<ColumnConfig[]>(() => {
    const saved = localStorage.getItem('blotter-columns-v3');
    if (!saved) return DEFAULT_COLUMNS;
    try {
      return JSON.parse(saved);
    } catch {
      return DEFAULT_COLUMNS;
    }
  });
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const prevTradeIdsRef = useRef<Set<string>>(new Set());
  const [draggedColumn, setDraggedColumn] = useState<number | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<number | null>(null);

  // Save columns to localStorage
  useEffect(() => {
    localStorage.setItem('blotter-columns-v3', JSON.stringify(columns));
  }, [columns]);

  // Helper function to sort instruments
  const sortInstruments = (instruments: string[]): string[] => {
    const instrumentOrder = ["3M", "6M", "1Y", "2Y", "3Y", "5Y", "7Y", "10Y", "15Y", "20Y", "30Y"];
    return instruments.sort((a, b) => {
      const baseA = a.split('/')[0] || a;
      const baseB = b.split('/')[0] || b;
      const indexA = instrumentOrder.indexOf(baseA);
      const indexB = instrumentOrder.indexOf(baseB);
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });
  };

  const uniqueInstruments = useMemo(() => {
    const instruments = Array.from(new Set(trades.map(t => t.instrument).filter((t): t is string => Boolean(t))));
    return sortInstruments(instruments);
  }, [trades]);

  const uniqueActions = useMemo(() => 
    Array.from(new Set(trades.map(t => t.action_type).filter(Boolean))).sort(),
    [trades]
  );
  
  const uniqueCurrencies = useMemo(() => 
    Array.from(new Set(trades.flatMap(t => [t.notional_currency_leg1, t.notional_currency_leg2]).filter(Boolean))).sort(),
    [trades]
  );

  const filteredTrades = useMemo(() => {
    let filtered = trades;
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(trade => 
        trade.unique_product_identifier_underlier_name?.toLowerCase().includes(term) ||
        trade.strategy_id?.toLowerCase().includes(term) ||
        trade.dissemination_identifier.toLowerCase().includes(term)
      );
    }
    
    if (actionFilter !== 'all') {
      filtered = filtered.filter(t => t.action_type === actionFilter);
    }
    
    if (tenorFilter !== 'all') {
      filtered = filtered.filter(t => t.instrument === tenorFilter);
    }

    if (currencyFilter !== 'all') {
      filtered = filtered.filter(t => t.notional_currency_leg1 === currencyFilter || t.notional_currency_leg2 === currencyFilter);
    }
    
    if (minNotional) {
      const min = parseFloat(minNotional);
      if (!isNaN(min)) {
        filtered = filtered.filter(t => (t.notional_amount_leg1 >= min || t.notional_amount_leg2 >= min));
      }
    }
    
    return filtered;
  }, [trades, searchTerm, actionFilter, tenorFilter, currencyFilter, minNotional]);

  const visibleColumns = useMemo(() => columns.filter(col => col.visible), [columns]);

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
      setTimeout(() => setHighlightedIds(new Set()), 2000);
    }

    prevTradeIdsRef.current = next;
  }, [trades]);

  const toggleExpand = useCallback((tradeId: string) => {
    setExpandedTrades(prev => {
      const next = new Set(prev);
      if (next.has(tradeId)) next.delete(tradeId);
      else next.add(tradeId);
      return next;
    });
  }, []);

  const toggleStrategyExpand = useCallback((strategyId: string) => {
    setExpandedStrategies(prev => {
      const next = new Set(prev);
      if (next.has(strategyId)) next.delete(strategyId);
      else next.add(strategyId);
      return next;
    });
  }, []);

  // Drag & Drop
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

  const strategiesById = useMemo(() => new Map(strategies.map(s => [s.strategy_id, s])), [strategies]);

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
    <div className="flex flex-col h-full bg-white dark:bg-[#1e2329] text-gray-800 dark:text-gray-200 font-sans transition-colors duration-200">
      {/* Compact Toolbar */}
      <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#2b3139] flex items-center justify-between gap-3 shadow-md z-20 transition-colors duration-200">
        <div className="flex items-center gap-3 flex-1 flex-wrap">
           <div className="relative group">
             <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
               <span className="text-gray-500 text-xs">🔍</span>
             </div>
             <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1 bg-white dark:bg-[#1e2329] border border-gray-300 dark:border-gray-600 rounded text-xs text-gray-900 dark:text-gray-200 focus:outline-none focus:border-blue-500 w-48 transition-all"
            />
           </div>
           
           {/* Quick Filters */}
           <div className="flex gap-2">
             <select 
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="bg-white dark:bg-[#1e2329] border border-gray-300 dark:border-gray-600 text-xs rounded px-2 py-1 text-gray-700 dark:text-gray-300 focus:border-blue-500 outline-none"
             >
               <option value="all">Action: All</option>
               {uniqueActions.map(a => <option key={a} value={a}>{a}</option>)}
             </select>
             
             <select 
                value={tenorFilter}
                onChange={(e) => setTenorFilter(e.target.value)}
                className="bg-white dark:bg-[#1e2329] border border-gray-300 dark:border-gray-600 text-xs rounded px-2 py-1 text-gray-700 dark:text-gray-300 focus:border-blue-500 outline-none"
             >
               <option value="all">Tenor: All</option>
               {uniqueInstruments.map(i => <option key={i} value={i}>{i}</option>)}
             </select>
             
             <select 
                value={currencyFilter}
                onChange={(e) => setCurrencyFilter(e.target.value)}
                className="bg-white dark:bg-[#1e2329] border border-gray-300 dark:border-gray-600 text-xs rounded px-2 py-1 text-gray-700 dark:text-gray-300 focus:border-blue-500 outline-none"
             >
               <option value="all">Ccy: All</option>
               {uniqueCurrencies.map(c => <option key={c} value={c}>{c}</option>)}
             </select>
             
             <input
                type="number"
                placeholder="Min Notional..."
                value={minNotional}
                onChange={(e) => setMinNotional(e.target.value)}
                className="w-24 bg-white dark:bg-[#1e2329] border border-gray-300 dark:border-gray-600 rounded text-xs px-2 py-1 text-gray-700 dark:text-gray-300 focus:border-blue-500 outline-none"
             />
           </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setShowColumnSelector(!showColumnSelector)}
            className="px-3 py-1 bg-white dark:bg-[#1e2329] border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-xs text-gray-700 dark:text-gray-300 transition-colors"
          >
            Columns
          </button>
        </div>
      </div>

      {showColumnSelector && (
        <div className="absolute top-12 right-4 z-50">
           <ColumnSelector columns={columns} onColumnsChange={setColumns} onClose={() => setShowColumnSelector(false)} />
        </div>
      )}

      {/* Table Header - Sticky & Dense */}
      <div className="flex-1 overflow-auto bg-white dark:bg-[#1e2329] scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
        <div className="min-w-full inline-block align-middle">
          <table className="min-w-full border-collapse" style={{ tableLayout: 'fixed' }}>
            <colgroup>
               {visibleColumns.map(col => (
                 <col key={col.id} style={{ width: `${col.width}px` }} />
               ))}
            </colgroup>
            <thead className="sticky top-0 z-10 bg-gray-100 dark:bg-[#2b3139] shadow-sm">
              <tr>
                {visibleColumns.map((col, index) => (
                  <th
                    key={col.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    className={`px-2 py-2 text-${col.align || 'left'} text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700 select-none cursor-move hover:text-gray-900 dark:hover:text-white transition-colors ${
                       draggedColumn === index ? 'opacity-50' : ''
                    } ${
                       dragOverColumn === index && draggedColumn !== index ? 'border-l-2 border-l-blue-500' : ''
                    }`}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-[#1e2329]">
              {displayTrades.map((item, rowIdx) => {
                if ('type' in item && item.type === 'strategy') {
                  const { strategy, trades } = item;
                  return (
                    <StrategyRow
                      key={`strategy-${strategy.strategy_id}`}
                      strategy={strategy}
                      trades={trades}
                      highlighted={trades.some(t => highlightedIds.has(t.dissemination_identifier))}
                      isExpanded={expandedStrategies.has(strategy.strategy_id)}
                      onToggleExpand={() => toggleStrategyExpand(strategy.strategy_id)}
                      visibleColumns={visibleColumns}
                      strategies={strategies}
                      rowIdx={rowIdx}
                    />
                  );
                }
                
                const trade = item as Trade;
                return (
                  <TradeRow
                    key={trade.dissemination_identifier}
                    trade={trade}
                    highlighted={highlightedIds.has(trade.dissemination_identifier)}
                    isExpanded={expandedTrades.has(trade.dissemination_identifier)}
                    hasLegs={trade.package_indicator && trade.package_legs && trade.package_legs.length > 0}
                    onToggleExpand={() => toggleExpand(trade.dissemination_identifier)}
                    visibleColumns={visibleColumns}
                    strategies={strategies}
                    rowIdx={rowIdx}
                  />
                );
              })}
              
              {displayTrades.length === 0 && (
                <tr>
                  <td colSpan={visibleColumns.length} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400 text-sm">
                    No trades match your criteria
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Footer Status */}
      <div className="bg-gray-100 dark:bg-[#2b3139] px-4 py-1 text-[10px] text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700 flex justify-between transition-colors duration-200">
         <span>{filteredTrades.length} Rows</span>
         <span className="font-mono">LIVE</span>
      </div>
    </div>
  );
}
