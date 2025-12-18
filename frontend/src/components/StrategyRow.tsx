/**
 * StrategyRow component for rendering a strategy row with expandable legs.
 * 
 * This component displays a strategy as a single row that can be expanded
 * to show all the legs (trades) that make up the strategy.
 */

import { memo } from 'react';
import { Trade, Strategy } from '../types/trade';
import { ColumnConfig } from './Blotter';
import TradeRow from './TradeRow';
import { extractUnderlierTenor } from '../utils/underlierTenor';

function sameColumns(a: ColumnConfig[], b: ColumnConfig[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.id !== b[i]!.id) return false;
    if (a[i]!.width !== b[i]!.width) return false;
  }
  return true;
}

/**
 * Props for the StrategyRow component.
 */
interface StrategyRowProps {
  strategy: Strategy;
  trades: Trade[];
  highlighted: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  visibleColumns: ColumnConfig[];
  strategies?: Strategy[];
}

function StrategyRowComponent({
  strategy,
  trades,
  highlighted,
  isExpanded,
  onToggleExpand,
  visibleColumns,
  strategies = []
}: StrategyRowProps) {
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatEur = (eur?: number) => {
    if (!eur) return '-';
    if (eur >= 1_000_000_000) {
      return `${(eur / 1_000_000_000).toFixed(2)}B`;
    } else if (eur >= 1_000_000) {
      return `${(eur / 1_000_000).toFixed(2)}M`;
    } else {
      return `${eur.toLocaleString()}`;
    }
  };

  const formatStrategyLabel = (strategy: Strategy): string => {
    // Return strategy type directly from API (already formatted)
    return strategy.strategy_type;
  };

  const getStrategyColor = (label: string) => {
    if (label.startsWith('Spread')) return 'bg-blue-100 text-blue-800';
    if (label.startsWith('Butterfly')) return 'bg-purple-100 text-purple-800';
    if (label.startsWith('Curve')) return 'bg-green-100 text-green-800';
    return 'bg-yellow-100 text-yellow-800';
  };

  const strategyLabel = formatStrategyLabel(strategy);
  const legsCount = strategy.legs?.length ?? trades.length;

  const renderCell = (columnId: string) => {
    switch (columnId) {
      case 'time':
        return (
          <div className="text-gray-700 font-mono text-sm font-semibold">
            {formatTime(strategy.execution_start)}
          </div>
        );
      
      case 'action':
        return (
          <div className="text-gray-700 text-xs font-semibold">
            {strategy.action_types && strategy.action_types.length > 0 ? strategy.action_types.join(' / ') : '-'}
          </div>
        );
      
      case 'underlying':
        return (
          <div className="text-gray-900 font-semibold truncate" title={strategy.underlying_name || ''}>
            {strategy.underlying_name || '-'}
          </div>
        );
      
      case 'notional':
        return (
          <div className="text-gray-900 font-medium text-xs">
            {strategy.total_notional_eur ? `${formatEur(strategy.total_notional_eur)} EUR` : '-'}
          </div>
        );
      
      case 'tenor':
        return (
          <div className="text-gray-600 text-xs">
            {extractUnderlierTenor(strategy.underlying_name) ?? '-'}
          </div>
        );

      case 'instrument':
        return (
          <div className="text-gray-600 text-xs">
            {strategy.instruments && strategy.instruments.length > 0 ? strategy.instruments.join(' / ') : '-'}
          </div>
        );
      
      case 'rate':
        const avgRate = strategy.avg_rate_leg1 ?? null;
        const displayRate = typeof avgRate === 'number' ? (Math.abs(avgRate) > 1 ? avgRate : avgRate * 100) : null;
        return (
          <div className="text-gray-700 font-mono text-xs">
            {displayRate !== null ? `${displayRate.toFixed(4)}%` : '-'}
          </div>
        );
      
      case 'package':
        return (
          <div className="flex items-center gap-2">
            {strategy.package_transaction_price && (
              <span className="text-blue-600" title="Package strategy">📦</span>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand();
              }}
              className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
                isExpanded
                  ? 'bg-purple-600 text-white hover:bg-purple-700'
                  : 'bg-purple-100 text-purple-800 hover:bg-purple-200'
              }`}
              title={isExpanded ? 'Collapse strategy' : `Expand ${legsCount} legs`}
            >
              {isExpanded ? '▼' : '▶'} {legsCount}
            </button>
          </div>
        );
      
      case 'strategy':
        return (
          <div className="flex items-center gap-1 flex-wrap">
            <span className={`px-2 py-1 rounded text-xs font-semibold whitespace-nowrap ${getStrategyColor(strategyLabel)}`}>
              {strategyLabel}
            </span>
          </div>
        );
      
      case 'platform':
        return (
          <div className="text-gray-600 text-xs">
            {strategy.platforms && strategy.platforms.length > 0 ? strategy.platforms.join(', ') : '-'}
          </div>
        );
      
      case 'eur':
        return (
          <div className="text-gray-700 font-semibold text-xs">
            {formatEur(strategy.total_notional_eur)}
          </div>
        );
      
      case 'id':
        return (
          <div className="text-gray-500 font-mono text-xs truncate" title={strategy.strategy_id}>
            {strategy.strategy_id}
          </div>
        );
      
      case 'currency':
        return (
          <div className="text-gray-600 text-xs">
            {strategy.currencies && strategy.currencies.length > 0 ? strategy.currencies.join(' / ') : '-'}
          </div>
        );
      
      case 'maturity':
        const maturities = (strategy.maturities ?? []).filter(Boolean).slice().sort();
        return (
          <div className="text-gray-600 text-xs">
            {maturities.length > 0 
              ? maturities.length === 1 
                ? maturities[0] 
                : `${maturities[0]} - ${maturities[maturities.length - 1]}`
              : '-'
            }
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <>
      <tr
        className={`border-b border-gray-100 hover:bg-gray-50/70 transition-colors ${
          highlighted ? 'bg-blue-50 ring-2 ring-blue-200' : 'bg-purple-50/60'
        }`}
      >
        {visibleColumns.map(col => (
          <td
            key={col.id}
            className="px-3 py-2 border-r border-gray-100 text-sm align-middle overflow-hidden"
            style={{ width: `${col.width}px`, maxWidth: `${col.width}px` }}
          >
            <div className="truncate" style={{ maxWidth: `${col.width - 24}px` }}>
              {renderCell(col.id)}
            </div>
          </td>
        ))}
      </tr>
      
      {/* Expanded Strategy Legs */}
      {isExpanded && trades.length > 0 && (
        <tr>
          <td colSpan={visibleColumns.length} className="p-0 border-b border-gray-200">
            <div className="bg-purple-50 border-l-4 border-purple-400">
              <div className="px-4 py-2 bg-purple-100 border-b border-purple-200">
                <div className="text-sm font-semibold text-purple-900">
                  Strategy: {strategyLabel} ({trades.length} leg{trades.length > 1 ? 's' : ''})
                  {strategy.package_transaction_price && ` - Package: ${strategy.package_transaction_price}`}
                </div>
                <div className="text-xs text-purple-700 mt-1">
                  Total Notional: {formatEur(strategy.total_notional_eur)} | 
                  Execution: {formatTime(strategy.execution_start)} - {formatTime(strategy.execution_end)}
                </div>
              </div>
              <div className="bg-white/50">
                <table className="w-full border-collapse" style={{ tableLayout: 'fixed', width: '100%' }}>
                  <colgroup>
                    {visibleColumns.map(col => (
                      <col key={col.id} style={{ width: `${col.width}px` }} />
                    ))}
                  </colgroup>
                  <tbody className="divide-y divide-purple-200">
                    {trades.map((trade, index) => (
                      <TradeRow
                        key={trade.dissemination_identifier || index}
                        trade={trade}
                        highlighted={false}
                        isLeg={true}
                        visibleColumns={visibleColumns}
                        strategies={strategies}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// Memoize StrategyRow to prevent unnecessary re-renders
// Only re-render if strategy data, highlighted status, or expansion state changes
export default memo(StrategyRowComponent, (prevProps, nextProps) => {
  return (
    prevProps.strategy.strategy_id === nextProps.strategy.strategy_id &&
    prevProps.highlighted === nextProps.highlighted &&
    prevProps.isExpanded === nextProps.isExpanded &&
    sameColumns(prevProps.visibleColumns, nextProps.visibleColumns) &&
    // Check if the strategy data has actually changed
    prevProps.strategy.total_notional_eur === nextProps.strategy.total_notional_eur &&
    prevProps.strategy.strategy_type === nextProps.strategy.strategy_type &&
    prevProps.strategy.underlying_name === nextProps.strategy.underlying_name &&
    prevProps.strategy.execution_start === nextProps.strategy.execution_start &&
    prevProps.strategy.execution_end === nextProps.strategy.execution_end &&
    prevProps.strategy.package_transaction_price === nextProps.strategy.package_transaction_price &&
    prevProps.strategy.avg_rate_leg1 === nextProps.strategy.avg_rate_leg1 &&
    (prevProps.strategy.action_types?.join('|') ?? '') === (nextProps.strategy.action_types?.join('|') ?? '') &&
    (prevProps.strategy.instruments?.join('|') ?? '') === (nextProps.strategy.instruments?.join('|') ?? '') &&
    (prevProps.strategy.platforms?.join('|') ?? '') === (nextProps.strategy.platforms?.join('|') ?? '') &&
    (prevProps.strategy.currencies?.join('|') ?? '') === (nextProps.strategy.currencies?.join('|') ?? '') &&
    (prevProps.strategy.maturities?.join('|') ?? '') === (nextProps.strategy.maturities?.join('|') ?? '') &&
    prevProps.trades.length === nextProps.trades.length &&
    // Compare first trade's timestamp to detect if trades changed
    prevProps.trades[0]?.execution_timestamp === nextProps.trades[0]?.execution_timestamp
  );
});
