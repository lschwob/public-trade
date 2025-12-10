import { useState } from 'react';
import { Analytics, Trade, Strategy } from '../types/trade';
import MarketOverview from './dashboard/MarketOverview';
import CurveAnalysis from './dashboard/CurveAnalysis';
import FlowMicrostructure from './dashboard/FlowMicrostructure';
import RiskDashboard from './dashboard/RiskDashboard';
import RealTimeMetrics from './dashboard/RealTimeMetrics';

interface DashboardProps {
  analytics: Analytics | null;
  trades: Trade[];
  strategies: Strategy[];
}

type TabType = 'overview' | 'curve' | 'flow' | 'risk' | 'realtime';

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function TabButton({ active, onClick, children }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
        active
          ? 'border-blue-600 text-blue-600'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
      }`}
    >
      {children}
    </button>
  );
}

export default function Dashboard({ analytics, trades, strategies }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  if (!analytics) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Loading analytics...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Tab Navigation */}
      <div className="bg-white border-b border-gray-200 px-6 shadow-sm">
        <nav className="flex space-x-8">
          <TabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>
            Market Overview
          </TabButton>
          <TabButton active={activeTab === 'curve'} onClick={() => setActiveTab('curve')}>
            Curve Analysis
          </TabButton>
          <TabButton active={activeTab === 'flow'} onClick={() => setActiveTab('flow')}>
            Flow & Microstructure
          </TabButton>
          <TabButton active={activeTab === 'risk'} onClick={() => setActiveTab('risk')}>
            Risk Dashboard
          </TabButton>
          <TabButton active={activeTab === 'realtime'} onClick={() => setActiveTab('realtime')}>
            Real-time Metrics
          </TabButton>
        </nav>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'overview' && <MarketOverview analytics={analytics} />}
        {activeTab === 'curve' && <CurveAnalysis curveMetrics={analytics.curve_metrics} strategyMetrics={analytics.strategy_metrics} />}
        {activeTab === 'flow' && <FlowMicrostructure flowMetrics={analytics.flow_metrics} currencyMetrics={analytics.currency_metrics} />}
        {activeTab === 'risk' && <RiskDashboard riskMetrics={analytics.risk_metrics} />}
        {activeTab === 'realtime' && <RealTimeMetrics realtimeMetrics={analytics.realtime_metrics} />}
      </div>
    </div>
  );
}


