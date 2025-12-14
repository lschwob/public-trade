import Gauge from './Gauge';

interface VolatilityGaugeProps {
  value: number;
  percentile?: number;
  max?: number;
}

export default function VolatilityGauge({ 
  value, 
  percentile = 50,
  max = 50 
}: VolatilityGaugeProps) {
  // Determine color zones based on percentile
  const thresholds = {
    low: 0,
    medium: 50,
    high: 80
  };

  return (
    <div className="flex flex-col items-center">
      <Gauge
        value={value}
        min={0}
        max={max}
        thresholds={thresholds}
        label="Volatility"
        size={120}
      />
      {percentile !== undefined && (
        <div className="mt-2 text-xs text-gray-600">
          {percentile.toFixed(0)}th %ile
        </div>
      )}
    </div>
  );
}
