import { useId } from "react";
import { cn } from "@/lib/utils";

type DataPoint = Readonly<{
  x: number;
  y: number;
}>;

type LineChartProps = Readonly<{
  data: ReadonlyArray<DataPoint>;
  baseline?: number;
  xLabel?: string;
  yLabel?: string;
  seriesColor?: "primary" | "secondary" | "tertiary";
  className?: string;
  height?: number;
}>;

const PADDING = { top: 16, right: 16, bottom: 28, left: 36 };
const DEFAULT_HEIGHT = 140;

function buildPath(points: ReadonlyArray<{ cx: number; cy: number }>): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  return (
    `M${first.cx},${first.cy}` + rest.map((p) => `L${p.cx},${p.cy}`).join("")
  );
}

const SERIES_CLASSES: Record<string, string> = {
  primary: "stroke-chart-series-primary",
  secondary: "stroke-chart-series-secondary",
  tertiary: "stroke-chart-series-tertiary",
};

export function LineChart({
  data,
  baseline,
  xLabel,
  yLabel,
  seriesColor = "primary",
  className,
  height = DEFAULT_HEIGHT,
}: LineChartProps) {
  const titleId = useId();
  const width = 400;
  const plotW = width - PADDING.left - PADDING.right;
  const plotH = height - PADDING.top - PADDING.bottom;

  if (data.length === 0) {
    return (
      <div
        className={cn("text-text-muted text-center text-sm italic", className)}
      >
        Not enough data yet
      </div>
    );
  }

  const xMin = Math.min(...data.map((d) => d.x));
  const xMax = Math.max(...data.map((d) => d.x));
  const yVals = data.map((d) => d.y);
  if (baseline !== undefined) yVals.push(baseline);
  const yMin = 0;
  const yMax = Math.max(...yVals, 1);

  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;

  const scaleX = (x: number) => PADDING.left + ((x - xMin) / xRange) * plotW;
  const scaleY = (y: number) =>
    PADDING.top + plotH - ((y - yMin) / yRange) * plotH;

  const points = data.map((d) => ({
    cx: scaleX(d.x),
    cy: scaleY(d.y),
    raw: d,
  }));

  const pathD = buildPath(points);

  const gridLines = 4;
  const gridYValues = Array.from(
    { length: gridLines },
    (_, i) => yMin + ((i + 1) / (gridLines + 1)) * yRange,
  );

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn("w-full", className)}
      aria-labelledby={titleId}
    >
      <title id={titleId}>
        {yLabel ? "Line chart: " + yLabel : "Line chart"}
      </title>
      {/* Grid lines */}
      {gridYValues.map((yVal) => (
        <line
          key={yVal}
          x1={PADDING.left}
          x2={width - PADDING.right}
          y1={scaleY(yVal)}
          y2={scaleY(yVal)}
          className="stroke-chart-grid"
          strokeWidth={0.5}
        />
      ))}

      {/* Baseline */}
      {baseline !== undefined && (
        <line
          x1={PADDING.left}
          x2={width - PADDING.right}
          y1={scaleY(baseline)}
          y2={scaleY(baseline)}
          className="stroke-chart-axis"
          strokeWidth={1}
          strokeDasharray="4 3"
        />
      )}

      {/* Data line */}
      <path
        d={pathD}
        fill="none"
        className={SERIES_CLASSES[seriesColor]}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Data points */}
      {points.map((p) => (
        <circle
          key={`${p.raw.x}-${p.raw.y}`}
          cx={p.cx}
          cy={p.cy}
          r={2.5}
          className={`${SERIES_CLASSES[seriesColor]} fill-surface-primary`}
          strokeWidth={1.5}
        />
      ))}

      {/* X-axis label */}
      {xLabel && (
        <text
          x={width / 2}
          y={height - 4}
          textAnchor="middle"
          className="fill-chart-axis font-mono text-[9px]"
        >
          {xLabel}
        </text>
      )}

      {/* Y-axis label */}
      {yLabel && (
        <text
          x={8}
          y={height / 2}
          textAnchor="middle"
          transform={`rotate(-90, 8, ${height / 2})`}
          className="fill-chart-axis font-mono text-[9px]"
        >
          {yLabel}
        </text>
      )}
    </svg>
  );
}
