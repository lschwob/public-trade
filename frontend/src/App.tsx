import { useMemo, useState } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import Blotter from './components/Blotter';
import Dashboard from './components/Dashboard';
import AlertPanel from './components/AlertPanel';
import { deriveAnalyticsFromTrades } from './utils/deriveAnalytics';

function App() {
  const { trades, strategies, alerts, analytics, connected, dismissAlert, clearAlerts } = useWebSocket();
  const [activeTab, setActiveTab] = useState<'blotter' | 'dashboard'>('blotter');
  const [showAlerts, setShowAlerts] = useState(true);
  const [universe, setUniverse] = useState<'all' | 'eur'>(() => {
    const saved = localStorage.getItem('instrument-universe');
    return saved === 'eur' ? 'eur' : 'all';
  });

  const eurUnderlyingRegex = useMemo(() => /EURIBOR|\bESTR\b|€STR/i, []);

  const { filteredTrades, filteredStrategies, filteredAlerts, filteredAnalytics } = useMemo(() => {
    if (universe === 'all') {
      return {
        filteredTrades: trades,
        filteredStrategies: strategies,
        filteredAlerts: alerts,
        filteredAnalytics: analytics,
      };
    }

    const isEurTrade = (t: (typeof trades)[number]) => {
      const hay = `${t.unique_product_identifier_underlier_name ?? ''} ${t.unique_product_identifier ?? ''}`;
      return eurUnderlyingRegex.test(hay);
    };

    const ft = trades.filter(isEurTrade);
    const tradeIdSet = new Set(ft.map(t => t.dissemination_identifier));

    const fs = strategies.filter(s => {
      if (eurUnderlyingRegex.test(s.underlying_name ?? '')) return true;
      return (s.legs ?? []).some(id => tradeIdSet.has(id));
    });

    const strategyIdSet = new Set(fs.map(s => s.strategy_id));

    const fa = alerts.filter(a => {
      // Keep alert if it has no linkage, or links to filtered trade/strategy
      if (!a.trade_id && !a.strategy_id) return true;
      if (a.trade_id && tradeIdSet.has(a.trade_id)) return true;
      if (a.strategy_id && strategyIdSet.has(a.strategy_id)) return true;
      return false;
    });

    const derived = deriveAnalyticsFromTrades({
      trades: ft,
      strategies: fs,
      alerts: fa,
      keepProTraderFrom: analytics,
    });

    return {
      filteredTrades: ft,
      filteredStrategies: fs,
      filteredAlerts: fa,
      filteredAnalytics: derived,
    };
  }, [alerts, analytics, eurUnderlyingRegex, strategies, trades, universe]);

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="px-6 py-4 flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-gray-900">IRS Monitoring</h1>
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="text-sm text-gray-600">
                  {connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              {/* Instrument universe filter */}
              <div className="flex items-center bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => {
                    setUniverse('all');
                    localStorage.setItem('instrument-universe', 'all');
                  }}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    universe === 'all' ? 'bg-white shadow text-gray-900' : 'text-gray-700 hover:text-gray-900'
                  }`}
                  title="Show all instruments"
                >
                  All
                </button>
                <button
                  onClick={() => {
                    setUniverse('eur');
                    localStorage.setItem('instrument-universe', 'eur');
                  }}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    universe === 'eur' ? 'bg-white shadow text-gray-900' : 'text-gray-700 hover:text-gray-900'
                  }`}
                  title="Filter to EUR (EURIBOR / ESTR)"
                >
                  EUR
                </button>
              </div>

              {/* Alert Toggle */}
              <button
                onClick={() => setShowAlerts(!showAlerts)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors relative ${
                  showAlerts
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Alerts
                {alerts.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {alerts.length}
                  </span>
                )}
              </button>
              
              {/* Tabs */}
              <div className="flex space-x-2">
                <button
                  onClick={() => setActiveTab('blotter')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    activeTab === 'blotter'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Blotter
                </button>
                <button
                  onClick={() => setActiveTab('dashboard')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    activeTab === 'dashboard'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Dashboard
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-hidden">
          {activeTab === 'blotter' ? (
            <Blotter trades={filteredTrades} strategies={filteredStrategies} />
          ) : (
            <Dashboard analytics={filteredAnalytics} trades={filteredTrades} strategies={filteredStrategies} />
          )}
        </main>
      </div>

      {/* Alert Panel */}
      {showAlerts && (
        <AlertPanel
          alerts={filteredAlerts}
          onDismiss={dismissAlert}
          onClear={clearAlerts}
        />
      )}
    </div>
  );
}

export default App;
