import React from 'react';
import { Treemap as RechartsTreemap, ResponsiveContainer, Tooltip, Cell } from 'recharts';

interface TreemapData {
  name: string;
  size: number;
  [key: string]: any;
}

interface TreemapProps {
  data: TreemapData[];
  dataKey?: string;
  nameKey?: string;
  colors?: string[];
  valueFormatter?: (value: number) => string;
}

const DEFAULT_COLORS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981',
  '#ef4444', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
];

export default function Treemap({
  data,
  dataKey = 'size',
  nameKey = 'name',
  colors = DEFAULT_COLORS,
  valueFormatter = (v) => {
    if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B`;
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
    return v.toLocaleString();
  }
}: TreemapProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        No data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={400}>
      <RechartsTreemap
        data={data}
        dataKey={dataKey}
        stroke="#fff"
        fill="#8884d8"
        content={<CustomContent nameKey={nameKey} valueFormatter={valueFormatter} />}
      >
        {data.map((entry, index) => (
          <Cell
            key={`cell-${index}`}
            fill={colors[index % colors.length]}
          />
        ))}
        <Tooltip
          formatter={(value: number) => valueFormatter(value)}
          contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', border: '1px solid #ccc' }}
        />
      </RechartsTreemap>
    </ResponsiveContainer>
  );
}

interface CustomContentProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  nameKey: string;
  valueFormatter: (value: number) => string;
  payload?: any;
}

function CustomContent({ x = 0, y = 0, width = 0, height = 0, nameKey, valueFormatter, payload }: CustomContentProps) {
  if (!payload) return null;

  const name = payload[nameKey] || 'Unknown';
  const value = payload.size || 0;
  const fontSize = Math.min(width / 10, height / 5, 14);

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={payload.fill || '#8884d8'}
        stroke="#fff"
        strokeWidth={2}
      />
      {width > 50 && height > 30 && (
        <text
          x={x + width / 2}
          y={y + height / 2 - fontSize / 2}
          textAnchor="middle"
          fill="#fff"
          fontSize={fontSize}
          fontWeight="bold"
        >
          {name}
        </text>
      )}
      {width > 50 && height > 30 && (
        <text
          x={x + width / 2}
          y={y + height / 2 + fontSize}
          textAnchor="middle"
          fill="#fff"
          fontSize={fontSize * 0.8}
        >
          {valueFormatter(value)}
        </text>
      )}
    </g>
  );
}

