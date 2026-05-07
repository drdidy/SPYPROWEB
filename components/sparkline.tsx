interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
}

export function Sparkline({ values, width = 600, height = 80, stroke = "#f5b642" }: SparklineProps) {
  if (values.length < 2) return null;
  const min = Math.min(...values) - 0.05;
  const max = Math.max(...values) + 0.05;
  const range = max - min || 1;
  const path = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 10) - 5;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full h-full">
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
