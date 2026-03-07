import { Card } from "@/components/ui/card";

interface KpiCardProps {
  label: string;
  value: string | number;
  delta?: string;
  deltaType?: "positive" | "negative" | "neutral";
  onDeltaClick?: () => void;
}

export function KpiCard({ label, value, delta, deltaType, onDeltaClick }: KpiCardProps) {
  const deltaColor =
    deltaType === "positive"
      ? "text-[#238551]"
      : deltaType === "negative"
        ? "text-[#CD4246]"
        : "text-muted-foreground";

  return (
    <Card className="flex flex-col gap-0.5 p-3 bg-card border-border">
      <span className="text-2xl font-bold font-mono" data-mono>
        {value}
      </span>
      <span className="text-xs text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      {delta && onDeltaClick ? (
        <button
          onClick={onDeltaClick}
          className={`text-xs font-mono ${deltaColor} text-left hover:underline cursor-pointer`}
        >
          {delta}
        </button>
      ) : delta ? (
        <span className={`text-xs font-mono ${deltaColor}`} data-mono>
          {delta}
        </span>
      ) : null}
    </Card>
  );
}
