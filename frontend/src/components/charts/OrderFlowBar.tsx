interface OrderFlowBarProps {
  direction: 'BUY_PRESSURE' | 'SELL_PRESSURE' | 'BALANCED';
  intensity: number; // 0-100
  buyVolumeRatio: number; // 0-1
}

export default function OrderFlowBar({ 
  direction, 
  intensity,
  buyVolumeRatio 
}: OrderFlowBarProps) {
  const buyPercentage = buyVolumeRatio * 100;
  const sellPercentage = (1 - buyVolumeRatio) * 100;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">Order Flow</span>
        <span className="text-xs text-gray-500">Intensity: {intensity.toFixed(0)}</span>
      </div>
      
      <div className="relative h-8 bg-gray-200 rounded-full overflow-hidden">
        {/* Buy pressure (left, green) */}
        <div
          className="absolute left-0 top-0 h-full bg-green-500 transition-all duration-300"
          style={{ width: `${buyPercentage}%` }}
        />
        
        {/* Sell pressure (right, red) */}
        <div
          className="absolute right-0 top-0 h-full bg-red-500 transition-all duration-300"
          style={{ width: `${sellPercentage}%` }}
        />
        
        {/* Center indicator */}
        <div className="absolute left-1/2 top-0 h-full w-0.5 bg-gray-800 transform -translate-x-1/2" />
      </div>
      
      <div className="flex justify-between mt-1 text-xs">
        <span className="text-green-600 font-medium">
          {buyPercentage.toFixed(0)}% Buy
        </span>
        <span className={`font-bold ${
          direction === 'BUY_PRESSURE' ? 'text-green-600' :
          direction === 'SELL_PRESSURE' ? 'text-red-600' :
          'text-gray-600'
        }`}>
          {direction.replace('_', ' ')}
        </span>
        <span className="text-red-600 font-medium">
          {sellPercentage.toFixed(0)}% Sell
        </span>
      </div>
    </div>
  );
}
