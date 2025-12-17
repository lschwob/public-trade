import { memo } from 'react';
import { Trade, Strategy } from '../types/trade';
import { ColumnConfig } from './Blotter';
import { getTenorFromTrade } from '../utils/underlierTenor';

interface TradeRowProps {
  trade: Trade;
  highlighted: boolean;
  isLeg?: boolean;
  isExpanded?: boolean;
  hasLegs?: boolean;
  onToggleExpand?: () => void;
  visibleColumns: ColumnConfig[];
  strategies?: Strategy[];
  rowIdx?: number;
}

function TradeRowComponent({
  trade,
  highlighted,
  isLeg = false,
  isExpanded = false,
  hasLegs = false,
  onToggleExpand,
  visibleColumns,
  strategies = [],
  rowIdx = 0
}: TradeRowProps) {
  
  const formatTime = (timestamp: string) => {
    return timestamp.split('T')[1]?.split('.')[0] || timestamp;
  };

  const formatNotional = (notional: number, currency: string) => {
    if (notional >= 1_000_000_000) return `${(notional / 1_000_000_000).toFixed(1)}B`;
    if (notional >= 1_000_000) return `${(notional / 1_000_000).toFixed(1)}M`;
    return `${(notional / 1_000).toFixed(0)}k`;
  };

  const formatRate = (val?: number) => {
    if (val === undefined || val === null) return '-';
    // Assume if |val| < 0.5 it is decimal, else percent. (Simple heuristic for now)
    // Most rates are < 10%.
    const isDecimal = Math.abs(val) < 0.5; 
    const pct = isDecimal ? val * 100 : val;
    return `${pct.toFixed(4)}`;
  };

  const getActionColor = (action: string) => {
    // Bank style: simple text colors
    switch (action) {
      case 'NEWT': return 'text-green-400 font-bold';
      case 'MODI': return 'text-yellow-400';
      case 'TERM': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  // Alternate row colors for better readability
  const bgClass = highlighted 
    ? 'bg-blue-900/30' 
    : isLeg 
      ? 'bg-[#1e2329]' 
      : rowIdx % 2 === 0 ? 'bg-[#1e2329]' : 'bg-[#252b33]';

  const renderCell = (col: ColumnConfig) => {
    switch (col.id) {
      case 'time':
        return <span className="font-mono text-gray-400">{formatTime(trade.execution_timestamp)}</span>;
      
      case 'action':
        return <span className={`text-[10px] px-1 rounded ${getActionColor(trade.action_type)}`}>{trade.action_type}</span>;
      
      case 'underlying':
        return <span className="text-gray-300 truncate block" title={trade.unique_product_identifier_underlier_name}>{trade.unique_product_identifier_underlier_name}</span>;
      
      case 'notional':
        const notional = Math.max(trade.notional_amount_leg1 || 0, trade.notional_amount_leg2 || 0);
        return <span className="font-mono font-medium text-gray-200">{formatNotional(notional, trade.notional_currency_leg1)}</span>;
      
      case 'rate':
        return <span className="font-mono text-cyan-300">{formatRate(trade.fixed_rate_leg1)}</span>;
      
      case 'instrument':
      case 'tenor': // Fallback to instrument if tenor requested
        return <span className="text-yellow-200/80 font-medium">{trade.instrument || getTenorFromTrade(trade)}</span>;
      
      case 'package':
        return (
          <div className="flex justify-center">
             {hasLegs && (
               <button 
                 onClick={(e) => { e.stopPropagation(); onToggleExpand?.(); }}
                 className="text-[10px] bg-blue-900/50 text-blue-300 px-1 rounded hover:bg-blue-800 transition"
               >
                 {isExpanded ? '▼' : '▶'} {trade.package_legs_count || trade.package_legs?.length || 'Pkg'}
               </button>
             )}
          </div>
        );

      case 'strategy':
        // If strategy exists, show it. If not, and it's a package, show 'Package'.
        const strat = strategies.find(s => s.strategy_id === trade.strategy_id);
        if (strat) return <span className="text-purple-300">{strat.strategy_type}</span>;
        if (trade.package_indicator) return <span className="text-gray-500 italic">Package</span>;
        return <span className="text-gray-600">-</span>;

      case 'platform':
        return <span className="text-gray-500">{trade.platform_identifier}</span>;

      default:
        return null;
    }
  };

  return (
    <>
      <tr className={`hover:bg-[#323a45] transition-colors border-b border-gray-800/50 ${bgClass}`}>
        {visibleColumns.map(col => (
          <td key={col.id} className={`px-2 py-1 text-xs whitespace-nowrap text-${col.align || 'left'} overflow-hidden`}>
            {renderCell(col)}
          </td>
        ))}
      </tr>
      
      {/* Expanded Legs */}
      {isExpanded && hasLegs && trade.package_legs && (
        <tr className="bg-[#1a1e23]">
          <td colSpan={visibleColumns.length} className="p-0">
             <div className="border-l-2 border-blue-500 pl-2 py-1">
                <table className="w-full">
                  <tbody>
                    {trade.package_legs.map((leg, idx) => (
                      <TradeRowComponent 
                        key={leg.dissemination_identifier || idx}
                        trade={leg}
                        highlighted={false}
                        isLeg={true}
                        visibleColumns={visibleColumns}
                        rowIdx={idx}
                      />
                    ))}
                  </tbody>
                </table>
             </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default memo(TradeRowComponent);
