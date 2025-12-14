import { LineChart, Line, ResponsiveContainer } from 'recharts';

interface MiniSparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}

export default function MiniSparkline({ 
  data, 
  width = 50, 
  height = 20,
  color 
}: MiniSparklineProps) {
  if (!data || data.length === 0) {
    return (
      <div 
        style={{ width, height }} 
        className="flex items-center justify-center text-gray-400 text-xs"
      >
        -
      </div>
    );
  }

  // Prepare data for recharts
  const chartData = data.map((value, index) => ({ value, index }));

  // Determine color based on trend if not provided
  const trendColor = color || (data[data.length - 1] > data[0] ? '#10b981' : '#ef4444');

  return (
    <div style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={trendColor}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
