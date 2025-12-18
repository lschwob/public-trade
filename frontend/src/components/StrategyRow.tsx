/**
 * StrategyRow component for rendering a strategy row with expandable legs.
 * 
 * This component displays a strategy as a single row with all strategy data
 * (product, tenor, instrument, execTime, price, ironPrice, platform, d2c, etc.)
 * that can be expanded to show all the legs with their full data.
 */

import { memo } from 'react';
import { Strategy, Leg } from '../types/trade';
import { ColumnConfig } from './Blotter';

/**
 * Props for the StrategyRow component.
 */
interface StrategyRowProps {
  strategy: Strategy;
  highlighted: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  visibleColumns: ColumnConfig[];
}

function StrategyRowComponent({
  strategy,
  highlighted,
  isExpanded,
  onToggleExpand,
  visibleColumns
}: StrategyRowProps) {
  // Get legs data - use legs_data if available, otherwise try legs
  const legsData: Leg[] = (strategy.legs_data || strategy.legs || []).filter(
    (leg): leg is Leg => typeof leg === 'object' && leg !== null
  );
  const legsCount = strategy.legs_count || strategy.legsCount || legsData.length;

  const formatTime = (timestamp?: string) => {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatNotional = (notional?: number) => {
    if (notional === undefined || notional === null) return '-';
    if (notional >= 1_000_000_000) {
      return `${(notional / 1_000_000_000).toFixed(2)}B`;
    } else if (notional >= 1_000_000) {
      return `${(notional / 1_000_000).toFixed(2)}M`;
    } else if (notional >= 1_000) {
      return `${(notional / 1_000).toFixed(1)}K`;
    } else {
      return `${notional.toLocaleString()}`;
    }
  };

  const formatPrice = (price?: number) => {
    if (price === undefined || price === null) return '-';
    // If price is > 1, it's likely already a percentage
    const displayPrice = Math.abs(price) > 1 ? price : price * 100;
    return `${displayPrice.toFixed(4)}%`;
  };

  const getProductColor = (product?: string) => {
    const p = (product || '').toLowerCase();
    if (p === 'outright' || p.includes('outright')) return 'bg-gray-100 text-gray-700';
    if (p.includes('spread')) return 'bg-blue-100 text-blue-800';
    if (p.includes('butterfly')) return 'bg-purple-100 text-purple-800';
    if (p.includes('curve')) return 'bg-green-100 text-green-800';
    return 'bg-yellow-100 text-yellow-800';
  };

  const renderCell = (columnId: string) => {
    switch (columnId) {
      case 'time':
        return (
          <div className="text-gray-700 font-mono text-sm font-semibold">
            {formatTime(strategy.executionDateTime || strategy.execution_date_time || strategy.execution_start)}
          </div>
        );
      
      case 'product':
        return (
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand();
              }}
              className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
                isExpanded 
                  ? 'bg-purple-600 text-white hover:bg-purple-700' 
                  : getProductColor(strategy.product || strategy.strategy_type)
              }`}
              title={isExpanded ? 'Collapse legs' : `Expand ${legsCount} legs`}
            >
              {isExpanded ? '▼' : '▶'} {strategy.product || strategy.strategy_type || 'Package'}
            </button>
          </div>
        );
      
      case 'underlying':
        return (
          <div className="text-gray-900 font-semibold truncate" title={strategy.underlier || strategy.underlying_name || ''}>
            {strategy.underlier || strategy.underlying_name || '-'}
          </div>
        );
      
      case 'tenor':
        return (
          <div className="text-gray-600 text-xs">
            {strategy.tenor || '-'}
          </div>
        );

      case 'instrument':
        return (
          <div className="text-gray-600 text-xs font-medium">
            {strategy.instrument || '-'}
          </div>
        );
      
      case 'notional':
        return (
          <div className="text-gray-900 font-medium text-xs">
            {formatNotional(strategy.notional || strategy.total_notional_eur)}
          </div>
        );
      
      case 'legs':
        return (
          <div className="text-gray-700 font-semibold text-xs text-center">
            {legsCount}
          </div>
        );
      
      case 'price':
        return (
          <div className="text-gray-700 font-mono text-xs">
            {formatPrice(strategy.price)}
          </div>
        );
      
      case 'ironPrice':
        return (
          <div className="text-gray-700 font-mono text-xs">
            {formatPrice(strategy.iron_price || strategy.ironPrice)}
          </div>
        );
      
      case 'platform':
        return (
          <div className="text-gray-600 text-xs">
            {strategy.platform || '-'}
          </div>
        );
      
      case 'd2c':
        return (
          <div className="text-center">
            {strategy.d2c !== undefined && strategy.d2c !== null ? (
              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                strategy.d2c ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
              }`}>
                {strategy.d2c ? 'Yes' : 'No'}
              </span>
            ) : '-'}
          </div>
        );
      
      case 'id':
        return (
          <div className="text-gray-500 font-mono text-xs truncate" title={strategy.strategy_id}>
            {strategy.strategy_id}
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <>
      <tr
        className={`border-b border-gray-100 hover:bg-gray-50/70 transition-colors cursor-pointer ${
          highlighted ? 'bg-blue-50 ring-2 ring-blue-200' : 'bg-white'
        }`}
        onClick={onToggleExpand}
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
      {isExpanded && legsData.length > 0 && (
        <tr>
          <td colSpan={visibleColumns.length} className="p-0 border-b border-gray-200">
            <div className="bg-purple-50 border-l-4 border-purple-400">
              <div className="px-4 py-2 bg-purple-100 border-b border-purple-200">
                <div className="text-sm font-semibold text-purple-900">
                  {strategy.product || strategy.strategy_type}: {legsCount} leg{legsCount > 1 ? 's' : ''}
                  {strategy.package_transaction_price && ` - Package Price: ${strategy.package_transaction_price}`}
                </div>
                <div className="text-xs text-purple-700 mt-1 flex flex-wrap gap-4">
                  <span>Total Notional: {formatNotional(strategy.notional || strategy.total_notional_eur)}</span>
                  {strategy.price !== undefined && strategy.price !== null && (
                    <span>Price: {formatPrice(strategy.price)}</span>
                  )}
                  {(strategy.iron_price || strategy.ironPrice) !== undefined && (
                    <span>Iron Price: {formatPrice(strategy.iron_price || strategy.ironPrice)}</span>
                  )}
                  {strategy.platform && <span>Platform: {strategy.platform}</span>}
                  {strategy.d2c !== undefined && <span>D2C: {strategy.d2c ? 'Yes' : 'No'}</span>}
                </div>
              </div>
              
              {/* Legs Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-purple-100/50">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-purple-900">Leg #</th>
                      <th className="px-3 py-2 text-left font-semibold text-purple-900">ID</th>
                      <th className="px-3 py-2 text-left font-semibold text-purple-900">Underlier</th>
                      <th className="px-3 py-2 text-left font-semibold text-purple-900">Exec Time</th>
                      <th className="px-3 py-2 text-left font-semibold text-purple-900">Effective</th>
                      <th className="px-3 py-2 text-left font-semibold text-purple-900">Expiration</th>
                      <th className="px-3 py-2 text-left font-semibold text-purple-900">Tenor L1</th>
                      <th className="px-3 py-2 text-left font-semibold text-purple-900">Tenor L2</th>
                      <th className="px-3 py-2 text-right font-semibold text-purple-900">Notional L1</th>
                      <th className="px-3 py-2 text-right font-semibold text-purple-900">Notional L2</th>
                      <th className="px-3 py-2 text-right font-semibold text-purple-900">Rate L1</th>
                      <th className="px-3 py-2 text-right font-semibold text-purple-900">Rate L2</th>
                      <th className="px-3 py-2 text-right font-semibold text-purple-900">Spread L1</th>
                      <th className="px-3 py-2 text-right font-semibold text-purple-900">Spread L2</th>
                      <th className="px-3 py-2 text-left font-semibold text-purple-900">Platform</th>
                      <th className="px-3 py-2 text-center font-semibold text-purple-900">Package</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-purple-200">
                    {legsData.map((leg, index) => (
                      <tr key={String(leg.id || index)} className="hover:bg-purple-50/50">
                        <td className="px-3 py-2 text-gray-600 font-semibold">{index + 1}</td>
                        <td className="px-3 py-2 text-gray-700 font-mono truncate max-w-[150px]" title={String(leg.id || leg.upiIsin || leg.upi || '')}>
                          {String(leg.id || leg.upiIsin || leg.upi || '-')}
                        </td>
                        <td className="px-3 py-2 text-gray-900 font-medium truncate max-w-[150px]" title={leg.rateUnderlier || leg.upi || ''}>
                          {leg.rateUnderlier || leg.upi || '-'}
                        </td>
                        <td className="px-3 py-2 text-gray-600 font-mono">
                          {formatTime(leg.executionTime || leg.eventTime)}
                        </td>
                        <td className="px-3 py-2 text-gray-600">
                          {leg.effectiveDate || '-'}
                        </td>
                        <td className="px-3 py-2 text-gray-600">
                          {leg.expirationDate || '-'}
                        </td>
                        <td className="px-3 py-2 text-gray-700">
                          {leg.tenorLeg1 || '-'}
                        </td>
                        <td className="px-3 py-2 text-gray-700">
                          {leg.tenorLeg2 || '-'}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-900 font-medium">
                          {formatNotional(leg.notionalAmountLeg1)}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700">
                          {formatNotional(leg.notionalAmountLeg2)}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700 font-mono">
                          {leg.fixedRateLeg1 !== undefined && leg.fixedRateLeg1 !== null 
                            ? `${(Math.abs(leg.fixedRateLeg1) > 1 ? leg.fixedRateLeg1 : leg.fixedRateLeg1 * 100).toFixed(4)}%` 
                            : '-'}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700 font-mono">
                          {leg.fixedRateLeg2 !== undefined && leg.fixedRateLeg2 !== null 
                            ? `${(Math.abs(leg.fixedRateLeg2) > 1 ? leg.fixedRateLeg2 : leg.fixedRateLeg2 * 100).toFixed(4)}%` 
                            : '-'}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700">
                          {leg.spreadLeg1 !== undefined && leg.spreadLeg1 !== null 
                            ? `${leg.spreadLeg1.toFixed(2)}` 
                            : '-'}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700">
                          {leg.spreadLeg2 !== undefined && leg.spreadLeg2 !== null 
                            ? `${leg.spreadLeg2.toFixed(2)}` 
                            : '-'}
                        </td>
                        <td className="px-3 py-2 text-gray-600">
                          {leg.platformCode || leg.platformName || '-'}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {leg.packageIndicator ? (
                            <span className="text-blue-600" title="Part of package">📦</span>
                          ) : '-'}
                        </td>
                      </tr>
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
export default memo(StrategyRowComponent, (prevProps, nextProps) => {
  return (
    prevProps.strategy.strategy_id === nextProps.strategy.strategy_id &&
    prevProps.highlighted === nextProps.highlighted &&
    prevProps.isExpanded === nextProps.isExpanded &&
    prevProps.visibleColumns.length === nextProps.visibleColumns.length &&
    // Check if the strategy data has actually changed
    prevProps.strategy.notional === nextProps.strategy.notional &&
    prevProps.strategy.price === nextProps.strategy.price &&
    (prevProps.strategy.legs_data?.length || 0) === (nextProps.strategy.legs_data?.length || 0)
  );
});
