import { memo } from 'react';
import { Trade, Strategy } from '../types/trade';
import { ColumnConfig } from './Blotter';
import TradeRow from './TradeRow';
import { getTenorFromTrade } from '../utils/underlierTenor';

interface StrategyRowProps {
  strategy: Strategy;
  trades: Trade[];
  highlighted: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  visibleColumns: ColumnConfig[];
  strategies?: Strategy[];
  rowIdx?: number;
}

function StrategyRowComponent({
  strategy,
  trades,
  highlighted,
  isExpanded,
  onToggleExpand,
  visibleColumns,
  strategies = [],
  rowIdx = 0
}: StrategyRowProps) {

  const firstTrade = trades[0];
  const displayTenor = firstTrade?.instrument || getTenorFromTrade(firstTrade) || '-';

  const formatNotional = (notional: number) => {
    if (notional >= 1_000_000_000) return `${(notional / 1_000_000_000).toFixed(1)}B`;
    if (notional >= 1_000_000) return `${(notional / 1_000_000).toFixed(1)}M`;
    return `${(notional / 1_000).toFixed(0)}k`;
  };

  const formatRate = (val?: number) => {
    if (val === undefined || val === null) return '-';
    // Heuristic: Weighted average rate if possible, or just first leg
    return `${(val * 100).toFixed(4)}`; 
  };
  
  const avgRate = trades.reduce((acc, t) => acc + (t.fixed_rate_leg1 || 0), 0) / (trades.length || 1);

  const bgClass = highlighted 
    ? 'bg-purple-100 dark:bg-purple-900/30' 
    : rowIdx % 2 === 0 ? 'bg-white dark:bg-[#1e2329]' : 'bg-gray-50/50 dark:bg-[#252b33]';

  const renderCell = (col: ColumnConfig) => {
    switch (col.id) {
      case 'time':
         return <span className="font-mono text-gray-600 dark:text-gray-400">{firstTrade.execution_timestamp.split('T')[1]?.split('.')[0]}</span>;
      
      case 'action':
         return (
            <button 
              onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
              className="text-[10px] bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 px-1 rounded hover:bg-purple-200 dark:hover:bg-purple-800 border border-purple-300 dark:border-purple-700/50"
            >
              {isExpanded ? '▼' : '▶'} STRAT
            </button>
         );
      
      case 'underlying':
         return <span className="text-purple-700 dark:text-purple-300 font-medium truncate block">{strategy.underlying_name}</span>;
      
      case 'notional':
         return <span className="font-mono text-gray-800 dark:text-gray-200">{formatNotional(strategy.total_notional_eur)}</span>;
         
      case 'rate':
         return <span className="font-mono text-cyan-600 dark:text-cyan-300">{formatRate(avgRate)}</span>;

      case 'instrument':
      case 'tenor':
         return <span className="text-yellow-600 dark:text-yellow-200/80 font-bold">{displayTenor}</span>;
      
      case 'strategy':
         return <span className="text-purple-700 dark:text-purple-300 font-bold">{strategy.strategy_type}</span>;
      
      case 'platform':
         return <span className="text-gray-500">{firstTrade.platform_identifier}</span>;
         
      case 'package':
         return strategy.package_transaction_price ? <span className="text-blue-500 dark:text-blue-400 text-[10px]">📦</span> : null;

      default:
         return null;
    }
  };

  return (
    <>
      <tr className={`hover:bg-gray-100 dark:hover:bg-[#323a45] transition-colors border-b border-gray-200 dark:border-gray-800/50 ${bgClass} cursor-pointer`} onClick={onToggleExpand}>
        {visibleColumns.map(col => (
          <td key={col.id} className={`px-2 py-1 text-xs whitespace-nowrap text-${col.align || 'left'} overflow-hidden border-l border-transparent`}>
             {/* Add a left border indicator for strategies */}
             {col.id === 'time' && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-purple-500"></div>}
             {renderCell(col)}
          </td>
        ))}
      </tr>
      
      {isExpanded && (
         <tr className="bg-gray-50 dark:bg-[#1a1e23]">
           <td colSpan={visibleColumns.length} className="p-0">
              <div className="border-l-2 border-purple-500 pl-2 py-1">
                 <div className="px-2 py-1 text-[10px] text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-[#2b2533] border-b border-gray-200 dark:border-gray-800">
                    Strategy Breakdown: {strategy.strategy_type} ({trades.length} legs)
                 </div>
                 <table className="w-full">
                    <tbody>
                      {trades.map((leg, idx) => (
                        <TradeRow
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

export default memo(StrategyRowComponent);
