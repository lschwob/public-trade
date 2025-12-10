import { useState } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import Blotter from './components/Blotter';
import Dashboard from './components/Dashboard';
import AlertPanel from './components/AlertPanel';

function App() {
  const { trades, strategies, alerts, analytics, connected, dismissAlert, clearAlerts } = useWebSocket();
  const [activeTab, setActiveTab] = useState<'blotter' | 'dashboard'>('blotter');
  const [showAlerts, setShowAlerts] = useState(true);

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
            <Blotter trades={trades} strategies={strategies} />
          ) : (
            <Dashboard analytics={analytics} trades={trades} strategies={strategies} />
          )}
        </main>
      </div>

      {/* Alert Panel */}
      {showAlerts && (
        <AlertPanel
          alerts={alerts}
          onDismiss={dismissAlert}
          onClear={clearAlerts}
        />
      )}
    </div>
  );
}

export default App;
