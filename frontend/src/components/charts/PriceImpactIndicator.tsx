import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';

interface PriceImpactIndicatorProps {
  impactByBucket: Record<string, number>;
  maxImpactTrade?: {
    trade_id: string;
    impact: number;
    size: number;
  } | null;
  recoveryVelocity?: number;
}

export default function PriceImpactIndicator({
  impactByBucket,
  maxImpactTrade,
  recoveryVelocity = 0
}: PriceImpactIndicatorProps) {
  const data = Object.entries(impactByBucket).map(([bucket, impact]) => ({
    bucket,
    impact
  }));

  const formatImpact = (value: number) => `${value.toFixed(2)} bps`;

  return (
    <div className="w-full">
      <h4 className="text-sm font-semibold text-gray-700 mb-3">Price Impact by Size</h4>
      
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data}>
          <XAxis 
            dataKey="bucket" 
            tick={{ fontSize: 10 }}
          />
          <YAxis 
            tick={{ fontSize: 10 }}
            label={{ value: 'Impact (bps)', angle: -90, position: 'insideLeft' }}
          />
          <Tooltip formatter={(value: number) => formatImpact(value)} />
          <Bar 
            dataKey="impact" 
            fill="#3b82f6"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
      
      {maxImpactTrade && (
        <div className="mt-3 p-2 bg-yellow-50 rounded text-xs">
          <div className="font-semibold text-yellow-800">Max Impact Trade</div>
          <div className="text-yellow-700">
            {formatImpact(maxImpactTrade.impact)} for {(maxImpactTrade.size / 1e6).toFixed(0)}M EUR
          </div>
        </div>
      )}
      
      {recoveryVelocity > 0 && (
        <div className="mt-2 text-xs text-gray-600">
          Recovery: {recoveryVelocity.toFixed(1)} min
        </div>
      )}
    </div>
  );
}
