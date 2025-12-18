import { useState } from 'react';
import { Analytics, Trade, Strategy } from '../types/trade';
import MarketOverview from './dashboard/MarketOverview';
import CurveAnalysis from './dashboard/CurveAnalysis';
import FlowMicrostructure from './dashboard/FlowMicrostructure';
import RiskDashboard from './dashboard/RiskDashboard';
import RealTimeMetrics from './dashboard/RealTimeMetrics';
import ProTrader from './dashboard/ProTrader';

interface DashboardProps {
  analytics: Analytics | null;
  trades: Trade[];
  strategies: Strategy[];
}

type TabType = 'overview' | 'curve' | 'flow' | 'risk' | 'realtime' | 'protrader';

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

export default function Dashboard({ analytics, trades }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  if (!analytics) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Loading analytics...
      </div>
    );
  }

  // Renamed "Pro Trader" to "Overview" and made it the default/only visible tab
  // Keeping other components in codebase but hiding navigation as requested.

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Tab Navigation - Simplified */}
      <div className="bg-white border-b border-gray-200 px-6 shadow-sm">
        <nav className="flex space-x-8">
          <TabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>
            Overview
          </TabButton>
          {/* Other tabs hidden as requested 
          <TabButton active={activeTab === 'curve'} onClick={() => setActiveTab('curve')}>
            Curve Analysis
          </TabButton>
          ...
          */}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'overview' && (
           <ProTrader 
             proTraderMetrics={analytics.pro_trader_metrics} 
             trades={trades} 
           />
        )}
      </div>
    </div>
  );
}
