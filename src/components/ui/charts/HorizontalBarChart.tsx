import { useId } from "react";
import { cn } from "@/lib/utils";

type BarItem = Readonly<{
  label: string;
  value: number;
}>;

type HorizontalBarChartProps = Readonly<{
  data: ReadonlyArray<BarItem>;
  className?: string;
}>;

const BAR_HEIGHT = 20;
const BAR_GAP = 8;
const LABEL_WIDTH = 90;
const PADDING = { top: 4, right: 12, bottom: 4, left: 4 };

const SERIES_FILLS = [
  "fill-chart-series-primary",
  "fill-chart-series-secondary",
  "fill-chart-series-tertiary",
  "fill-accent-primary",
  "fill-accent-strong",
];

export function HorizontalBarChart({
  data,
  className,
}: HorizontalBarChartProps) {
  const titleId = useId();

  if (data.length === 0) {
    return (
      <div
        className={cn("text-text-muted text-center text-sm italic", className)}
      >
        Not enough data yet
      </div>
    );
  }

  const width = 400;
  const barAreaWidth = width - LABEL_WIDTH - PADDING.left - PADDING.right;
  const height =
    PADDING.top +
    data.length * (BAR_HEIGHT + BAR_GAP) -
    BAR_GAP +
    PADDING.bottom;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn("w-full", className)}
      aria-labelledby={titleId}
    >
      <title id={titleId}>Participation distribution chart</title>
      {data.map((item, i) => {
        const y = PADDING.top + i * (BAR_HEIGHT + BAR_GAP);
        // values are shares in [0, 1] — scale directly so bar width matches
        // the displayed percentage label (e.g. 0.35 → 35 % of bar area).
        const barWidth = Math.min(item.value, 1) * barAreaWidth;
        const pct = Math.round(item.value * 100);

        return (
          <g key={item.label}>
            {/* Label — usernames in mono per editorial palette */}
            <text
              x={LABEL_WIDTH - 4}
              y={y + BAR_HEIGHT / 2 + 1}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-text-secondary font-mono text-[10px]"
            >
              {item.label.length > 12
                ? `${item.label.slice(0, 11)}…`
                : item.label}
            </text>

            {/* Bar background */}
            <rect
              x={LABEL_WIDTH}
              y={y}
              width={barAreaWidth}
              height={BAR_HEIGHT}
              rx={4}
              className="fill-chart-grid"
            />

            {/* Bar fill */}
            <rect
              x={LABEL_WIDTH}
              y={y}
              width={Math.max(barWidth, 2)}
              height={BAR_HEIGHT}
              rx={4}
              className={SERIES_FILLS[i % SERIES_FILLS.length]}
              opacity={0.85}
            />

            {/* Value label */}
            <text
              x={LABEL_WIDTH + barWidth + 6}
              y={y + BAR_HEIGHT / 2 + 1}
              dominantBaseline="middle"
              className="fill-text-muted font-mono text-[9px]"
            >
              {pct}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}
