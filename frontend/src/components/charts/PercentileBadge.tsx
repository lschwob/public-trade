interface PercentileBadgeProps {
  percentile: number;
  label?: string;
}

export default function PercentileBadge({ percentile, label }: PercentileBadgeProps) {
  // Determine color based on percentile
  let colorClass = 'bg-gray-100 text-gray-700';
  if (percentile >= 90) {
    colorClass = 'bg-red-100 text-red-700';
  } else if (percentile >= 50) {
    colorClass = 'bg-yellow-100 text-yellow-700';
  } else {
    colorClass = 'bg-green-100 text-green-700';
  }

  const displayLabel = label || `${percentile.toFixed(0)}th %ile`;

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${colorClass}`}>
      {displayLabel}
    </span>
  );
}
