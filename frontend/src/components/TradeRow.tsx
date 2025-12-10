/**
 * TradeRow component for rendering a single trade row in the blotter.
 * 
 * This component handles:
 * - Display of trade data in table cells
 * - Expansion of package legs (DTCC packages)
 * - Expansion of grouped trades (same timestamp/underlying)
 * - Strategy badge display with tenor pairs (e.g., "Spread 10s30s")
 * - Forward trade indicator (FWD badge)
 * - Highlighting for new trades
 * 
 * Strategy labels:
 * - "Outright": Single trade, no package, no strategy
 * - "Multiline Compression": Package but no detected strategy
 * - "Spread 10s30s": Detected spread with tenor pair
 * - "Butterfly 10s15s30s": Detected butterfly with tenor legs
 * - "Curve ...": Detected curve trade
 */

import { useState } from 'react';
import { Trade, Strategy } from '../types/trade';
import { ColumnConfig } from './Blotter';

/**
 * Props for the TradeRow component.
 */
interface TradeRowProps {
  trade: Trade;
  highlighted: boolean;
  isLeg?: boolean;
  isExpanded?: boolean;
  hasLegs?: boolean;
  onToggleExpand?: () => void;
  visibleColumns: ColumnConfig[];
  strategies?: Strategy[];
}

export default function TradeRow({
  trade,
  highlighted,
  isLeg = false,
  isExpanded = false,
  hasLegs = false,
  onToggleExpand,
  visibleColumns,
  strategies = []
}: TradeRowProps) {
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatNotional = (notional: number, currency: string) => {
    if (notional >= 1_000_000_000) {
      return `${(notional / 1_000_000_000).toFixed(2)}B ${currency}`;
    } else if (notional >= 1_000_000) {
      return `${(notional / 1_000_000).toFixed(2)}M ${currency}`;
    } else {
      return `${notional.toLocaleString()} ${currency}`;
    }
  };

  const formatRate = () => {
    if (trade.fixed_rate_leg1 !== undefined && trade.fixed_rate_leg1 !== null) {
      return `${(trade.fixed_rate_leg1 * 100).toFixed(4)}%`;
    } else if (trade.spread_leg2 !== undefined && trade.spread_leg2 !== null) {
      return `Spread: ${trade.spread_leg2}`;
    }
    return '-';
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

  const getActionBadgeColor = () => {
    switch (trade.action_type) {
      case 'NEWT':
        return 'bg-green-100 text-green-800';
      case 'MODI':
        return 'bg-yellow-100 text-yellow-800';
      case 'TERM':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const hasGroupedTrades = trade.grouped_trades && trade.grouped_trades.length > 0;
  
  const renderCell = (columnId: string) => {
    switch (columnId) {
      case 'time':
        return (
          <div className="text-gray-700 font-mono text-sm font-semibold">
            {formatTime(trade.execution_timestamp)}
          </div>
        );
      
      case 'action':
        return (
          <span className={`px-2 py-1 rounded text-xs font-semibold ${getActionBadgeColor()}`}>
            {trade.action_type}
          </span>
        );
      
      case 'underlying':
        return (
          <div className="text-gray-900 font-semibold truncate" title={trade.unique_product_identifier_underlier_name || ''}>
            {trade.unique_product_identifier_underlier_name || '-'}
          </div>
        );
      
      case 'notional':
        // Use the maximum of leg1 and leg2, or leg1 if leg2 is 0
        const notional1 = trade.notional_amount_leg1 || 0;
        const notional2 = trade.notional_amount_leg2 || 0;
        const maxNotional = Math.max(notional1, notional2);
        const currency = maxNotional === notional2 && notional2 > 0 
          ? trade.notional_currency_leg2 
          : trade.notional_currency_leg1;
        
        return (
          <div className="text-gray-900 font-medium text-xs">
            {maxNotional > 0 ? formatNotional(maxNotional, currency) : '-'}
          </div>
        );
      
      case 'tenor':
        return (
          <div className="text-gray-600 text-xs">
            {trade.tenor || '-'}
          </div>
        );
      
      case 'rate':
        return (
          <div className="text-gray-700 font-mono text-xs">
            {formatRate()}
          </div>
        );
      
      case 'package':
        const hasGroupedTrades = trade.grouped_trades && trade.grouped_trades.length > 0;
        const totalGrouped = trade.grouped_trades_count || trade.grouped_trades?.length || 0;
        
        return (
          <div className="flex items-center gap-2">
            {trade.package_indicator && (
              <span className="text-blue-600" title="Package trade">📦</span>
            )}
            {hasGroupedTrades && onToggleExpand && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleExpand();
                }}
                className="text-green-600 hover:text-green-800 text-sm font-semibold px-2 py-1 rounded hover:bg-green-50 transition-colors border border-green-300"
                title={isExpanded ? 'Collapse grouped trades' : `Expand ${totalGrouped} grouped trades`}
              >
                {isExpanded ? '▼' : '▶'} {totalGrouped}
              </button>
            )}
            {hasLegs && !hasGroupedTrades && onToggleExpand && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleExpand();
                }}
                className="text-blue-600 hover:text-blue-800 text-sm font-semibold px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                title={isExpanded ? 'Collapse legs' : `Expand ${trade.package_legs_count || trade.package_legs?.length || 0} legs`}
              >
                {isExpanded ? '▼' : '▶'} {trade.package_legs_count || trade.package_legs?.length || 0}
              </button>
            )}
          </div>
        );
      
      case 'strategy':
        // Format strategy label
        const formatStrategyLabel = (trade: Trade, strategy?: Strategy): string => {
          // If trade is in a package but no strategy detected, it's Multiline Compression
          if (trade.package_indicator && (!trade.strategy_id || !strategy)) {
            return 'Multiline Compression';
          }
          
          // If no strategy and not a package, it's an outright (directional trade)
          if (!trade.strategy_id || !strategy) {
            return 'Outright';
          }
          
          // Format tenor pair with 's' notation (10s30s instead of 10Y/30Y)
          const tenorPair = strategy.tenor_pair
            ?.replace(/Y/g, 's')
            .replace(/\//g, '');
          
          // Get strategy type base (Spread, Butterfly, Curve)
          const baseType = strategy.strategy_type.split(' ').pop() || strategy.strategy_type;
          
          // Return formatted label
          if (tenorPair) {
            return `${baseType} ${tenorPair}`;
          }
          return baseType;
        };
        
        const strategy = strategies.find(s => s.strategy_id === trade.strategy_id);
        const strategyLabel = formatStrategyLabel(trade, strategy);
        
        // Color based on type
        const getStrategyColor = (label: string) => {
          if (label === 'Outright') return 'bg-gray-100 text-gray-700';
          if (label === 'Multiline Compression') return 'bg-amber-100 text-amber-800';
          if (label.startsWith('Spread')) return 'bg-blue-100 text-blue-800';
          if (label.startsWith('Butterfly')) return 'bg-purple-100 text-purple-800';
          if (label.startsWith('Curve')) return 'bg-green-100 text-green-800';
          return 'bg-yellow-100 text-yellow-800';
        };
        
        return (
          <div className="flex items-center gap-1 flex-wrap">
            <span className={`px-2 py-1 rounded text-xs font-semibold whitespace-nowrap ${getStrategyColor(strategyLabel)}`}>
              {strategyLabel}
            </span>
            {trade.is_forward && (
              <span className="px-1.5 py-0.5 bg-orange-100 text-orange-800 rounded text-xs font-medium whitespace-nowrap">
                FWD
              </span>
            )}
          </div>
        );
      
      case 'platform':
        return (
          <div className="text-gray-600 text-xs">
            {trade.platform_identifier || '-'}
          </div>
        );
      
      case 'eur':
        return (
          <div className="text-gray-700 font-semibold text-xs">
            {formatEur(trade.notional_eur)}
          </div>
        );
      
      case 'id':
        return (
          <div className="text-gray-500 font-mono text-xs truncate" title={trade.dissemination_identifier}>
            {trade.dissemination_identifier}
          </div>
        );
      
      case 'currency':
        return (
          <div className="text-gray-600 text-xs">
            {trade.notional_currency_leg1} / {trade.notional_currency_leg2}
          </div>
        );
      
      case 'maturity':
        return (
          <div className="text-gray-600 text-xs">
            {trade.expiration_date || '-'}
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <>
      <tr
        className={`border-b border-gray-200 hover:bg-gray-50 transition-all ${
          highlighted ? 'bg-blue-50 ring-2 ring-blue-300' : 'bg-white'
        } ${
          isLeg ? 'bg-gray-50 border-l-4 border-blue-300' : ''
        }`}
      >
              {visibleColumns.map(col => (
                <td
                  key={col.id}
                  className="px-3 py-3 border-r border-gray-200 text-sm align-middle overflow-hidden"
                  style={{ width: `${col.width}px`, maxWidth: `${col.width}px` }}
                >
                  <div className="truncate" style={{ maxWidth: `${col.width - 24}px` }}>
                    {renderCell(col.id)}
                  </div>
                </td>
              ))}
      </tr>
      
      {/* Expanded Grouped Trades Dropdown */}
      {isExpanded && hasGroupedTrades && trade.grouped_trades && trade.grouped_trades.length > 0 && (
        <tr>
          <td colSpan={visibleColumns.length} className="p-0 border-b border-gray-200">
            <div className="bg-green-50 border-l-4 border-green-400">
              <div className="px-4 py-2 bg-green-100 border-b border-green-200">
                <div className="text-sm font-semibold text-green-900">
                  Grouped Trades ({trade.grouped_trades.length}) - Same timestamp/underlying
                </div>
              </div>
              <div className="divide-y divide-green-200">
                {trade.grouped_trades.map((groupedTrade, index) => (
                  <div key={groupedTrade.dissemination_identifier || index} className="px-4 py-3 bg-white/50">
                    <div className="grid grid-cols-12 gap-4 text-xs">
                      <div className="col-span-2">
                        <span className="font-semibold text-gray-700">ID:</span>
                        <div className="text-gray-600 font-mono mt-1">{groupedTrade.dissemination_identifier}</div>
                      </div>
                      <div className="col-span-2">
                        <span className="font-semibold text-gray-700">Underlying:</span>
                        <div className="text-gray-600 mt-1">{groupedTrade.unique_product_identifier_underlier_name || '-'}</div>
                      </div>
                      <div className="col-span-2">
                        <span className="font-semibold text-gray-700">Notional:</span>
                        <div className="text-gray-600 mt-1">
                          {formatNotional(groupedTrade.notional_amount_leg1, groupedTrade.notional_currency_leg1)}
                        </div>
                      </div>
                      <div className="col-span-2">
                        <span className="font-semibold text-gray-700">Tenor:</span>
                        <div className="text-gray-600 mt-1">{groupedTrade.tenor || '-'}</div>
                      </div>
                      <div className="col-span-2">
                        <span className="font-semibold text-gray-700">Rate:</span>
                        <div className="text-gray-600 mt-1 font-mono">
                          {groupedTrade.fixed_rate_leg1 ? `${(groupedTrade.fixed_rate_leg1 * 100).toFixed(4)}%` : '-'}
                        </div>
                      </div>
                      <div className="col-span-2">
                        <span className="font-semibold text-gray-700">EUR:</span>
                        <div className="text-gray-600 mt-1 font-semibold">
                          {formatEur(groupedTrade.notional_eur)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </td>
        </tr>
      )}
      
      {/* Expanded Package Legs Dropdown */}
      {isExpanded && !hasGroupedTrades && hasLegs && trade.package_legs && trade.package_legs.length > 0 && (
        <tr>
          <td colSpan={visibleColumns.length} className="p-0 border-b border-gray-200">
            <div className="bg-blue-50 border-l-4 border-blue-400">
              <div className="px-4 py-2 bg-blue-100 border-b border-blue-200">
                <div className="text-sm font-semibold text-blue-900">
                  Package Legs ({trade.package_legs.length})
                </div>
              </div>
              <div className="divide-y divide-blue-200">
                {trade.package_legs.map((leg, index) => (
                  <div key={leg.dissemination_identifier || index} className="px-4 py-3 bg-white/50">
                    <div className="grid grid-cols-12 gap-4 text-xs">
                      <div className="col-span-2">
                        <span className="font-semibold text-gray-700">ID:</span>
                        <div className="text-gray-600 font-mono mt-1">{leg.dissemination_identifier}</div>
                      </div>
                      <div className="col-span-2">
                        <span className="font-semibold text-gray-700">Underlying:</span>
                        <div className="text-gray-600 mt-1">{leg.unique_product_identifier_underlier_name || '-'}</div>
                      </div>
                      <div className="col-span-2">
                        <span className="font-semibold text-gray-700">Notional:</span>
                        <div className="text-gray-600 mt-1">
                          {formatNotional(leg.notional_amount_leg1, leg.notional_currency_leg1)}
                        </div>
                      </div>
                      <div className="col-span-2">
                        <span className="font-semibold text-gray-700">Tenor:</span>
                        <div className="text-gray-600 mt-1">{leg.tenor || '-'}</div>
                      </div>
                      <div className="col-span-2">
                        <span className="font-semibold text-gray-700">Rate:</span>
                        <div className="text-gray-600 mt-1 font-mono">
                          {leg.fixed_rate_leg1 ? `${(leg.fixed_rate_leg1 * 100).toFixed(4)}%` : '-'}
                        </div>
                      </div>
                      <div className="col-span-2">
                        <span className="font-semibold text-gray-700">EUR:</span>
                        <div className="text-gray-600 mt-1 font-semibold">
                          {formatEur(leg.notional_eur)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
