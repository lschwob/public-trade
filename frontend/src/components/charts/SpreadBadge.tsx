interface SpreadBadgeProps {
  value: number;
  showZScore?: boolean;
  zScore?: number | null;
  className?: string;
}

export default function SpreadBadge({ 
  value, 
  showZScore = false, 
  zScore = null,
  className = '' 
}: SpreadBadgeProps) {
  const isPositive = value >= 0;
  const absValue = Math.abs(value);
  const arrow = isPositive ? '↑' : '↓';
  
  // Determine color based on value
  let colorClass = 'text-gray-600';
  if (absValue > 1) {
    colorClass = isPositive ? 'text-green-600' : 'text-red-600';
  }

  // Z-score indicator
  const zScoreBadge = showZScore && zScore !== null && Math.abs(zScore) > 2 ? (
    <span className="ml-1 text-xs text-red-600 font-bold">
      ({zScore > 0 ? '+' : ''}{zScore.toFixed(1)}σ)
    </span>
  ) : null;

  return (
    <span className={`inline-flex items-center font-mono text-sm ${colorClass} ${className}`}>
      {isPositive ? '+' : ''}{absValue.toFixed(1)} {arrow}
      {zScoreBadge}
    </span>
  );
}
