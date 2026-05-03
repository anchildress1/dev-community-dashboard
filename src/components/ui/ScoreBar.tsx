import { useId } from "react";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type ScoreBarProps = Readonly<{
  label: string;
  sublabel: string;
  description: string;
  value: number;
  max: number;
  colorClass: string;
  className?: string;
}>;

export function ScoreBar({
  label,
  sublabel,
  description,
  value,
  max,
  colorClass,
  className,
}: ScoreBarProps) {
  const tooltipId = useId();
  const widthPercent = Math.min((value / max) * 100, 100);

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="text-text-secondary flex justify-between text-sm font-medium">
        <span className="flex items-center gap-1">
          {label}
          <button
            type="button"
            className="group relative shrink-0 cursor-help"
            aria-describedby={tooltipId}
            aria-label={`About ${label}`}
          >
            <HelpCircle className="text-text-muted group-hover:text-accent-primary group-focus:text-accent-primary h-3.5 w-3.5" />
            <span
              id={tooltipId}
              role="tooltip"
              className="bg-surface-raised text-text-primary border-surface-border pointer-events-none absolute top-1/2 left-6 z-10 w-56 -translate-y-1/2 rounded-lg border px-3 py-2 text-xs leading-relaxed font-normal opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus:opacity-100"
            >
              {description}
            </span>
          </button>
        </span>
        <span className="font-mono text-xs">{sublabel}</span>
      </div>
      <div className="bg-surface-secondary border-surface-border h-1.5 w-full overflow-hidden rounded-full border">
        <div
          className={cn("h-full rounded-full transition-all", colorClass)}
          style={{ width: `${widthPercent}%` }}
        />
      </div>
    </div>
  );
}
