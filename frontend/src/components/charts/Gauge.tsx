import React from 'react';

interface GaugeProps {
  value: number;
  min?: number;
  max?: number;
  thresholds?: { low: number; medium: number; high: number };
  label?: string;
  unit?: string;
  size?: number;
}

export default function Gauge({
  value,
  min = 0,
  max = 100,
  thresholds = { low: 33, medium: 66, high: 100 },
  label,
  unit = '',
  size = 120
}: GaugeProps) {
  const percentage = Math.min(Math.max(((value - min) / (max - min)) * 100, 0), 100);
  const radius = size / 2 - 10;
  const circumference = 2 * Math.PI * radius;
  const strokeDasharray = circumference;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  // Determine color based on thresholds
  let color = '#10b981'; // green
  if (percentage < thresholds.low) {
    color = '#ef4444'; // red
  } else if (percentage < thresholds.medium) {
    color = '#f59e0b'; // yellow
  } else if (percentage < thresholds.high) {
    color = '#3b82f6'; // blue
  }

  return (
    <div className="flex flex-col items-center">
      {label && (
        <div className="text-sm font-medium text-gray-700 mb-2">{label}</div>
      )}
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="8"
          />
          {/* Value circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeDasharray={strokeDasharray}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-500"
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-2xl font-bold" style={{ color }}>
            {value.toFixed(1)}
          </div>
          {unit && <div className="text-xs text-gray-500">{unit}</div>}
        </div>
      </div>
    </div>
  );
}

