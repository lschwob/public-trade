import React from 'react';

interface HeatmapData {
  x: string;
  y: string;
  value: number;
}

interface HeatmapProps {
  data: HeatmapData[];
  xLabels: string[];
  yLabels: string[];
  valueFormatter?: (value: number) => string;
  colorScale?: (value: number, max: number) => string;
}

export default function Heatmap({
  data,
  xLabels,
  yLabels,
  valueFormatter = (v) => v.toLocaleString(),
  colorScale = defaultColorScale
}: HeatmapProps) {
  const maxValue = Math.max(...data.map(d => d.value), 1);
  
  // Create a map for quick lookup
  const dataMap = new Map<string, number>();
  data.forEach(d => {
    dataMap.set(`${d.x}-${d.y}`, d.value);
  });

  const cellWidth = 100;
  const cellHeight = 40;

  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full">
        <table className="border-collapse">
          <thead>
            <tr>
              <th className="p-2 text-xs font-medium text-gray-600"></th>
              {xLabels.map((label) => (
                <th
                  key={label}
                  className="p-2 text-xs font-medium text-gray-600 text-center"
                  style={{ width: cellWidth }}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {yLabels.map((yLabel) => (
              <tr key={yLabel}>
                <td className="p-2 text-xs font-medium text-gray-600 text-right">
                  {yLabel}
                </td>
                {xLabels.map((xLabel) => {
                  const value = dataMap.get(`${xLabel}-${yLabel}`) || 0;
                  const color = colorScale(value, maxValue);
                  const opacity = value > 0 ? Math.min(value / maxValue, 1) : 0.1;
                  
                  return (
                    <td
                      key={`${xLabel}-${yLabel}`}
                      className="p-2 text-center border border-gray-200"
                      style={{
                        backgroundColor: color,
                        opacity: Math.max(opacity, 0.1),
                        minWidth: cellWidth,
                        height: cellHeight
                      }}
                      title={`${xLabel} × ${yLabel}: ${valueFormatter(value)}`}
                    >
                      {value > 0 && (
                        <span className="text-xs font-medium text-gray-800">
                          {valueFormatter(value)}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function defaultColorScale(value: number, max: number): string {
  if (value === 0) return '#f3f4f6';
  const ratio = value / max;
  if (ratio < 0.2) return '#dbeafe'; // light blue
  if (ratio < 0.4) return '#93c5fd'; // blue
  if (ratio < 0.6) return '#60a5fa'; // medium blue
  if (ratio < 0.8) return '#3b82f6'; // dark blue
  return '#1e40af'; // darker blue
}

