import { Badge } from "@/components/ui/badge";

const statusColors: Record<string, string> = {
  green: "bg-[#238551]/20 text-[#238551] border-[#238551]/30",
  red: "bg-[#EC9A3C]/20 text-[#EC9A3C] border-[#EC9A3C]/30",
  blocked: "bg-[#CD4246]/20 text-[#CD4246] border-[#CD4246]/30",
  pending: "bg-muted text-muted-foreground border-border",
  active: "bg-[#2D72D2]/20 text-[#2D72D2] border-[#2D72D2]/30",
  A: "bg-[#238551]/20 text-[#238551] border-[#238551]/30",
  B: "bg-[#EC9A3C]/20 text-[#EC9A3C] border-[#EC9A3C]/30",
  C: "bg-[#CD4246]/20 text-[#CD4246] border-[#CD4246]/30",
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const colors = statusColors[status] ?? statusColors.pending;
  return (
    <Badge
      variant="outline"
      className={`text-[11px] font-mono uppercase px-1.5 py-0 ${colors} ${className ?? ""}`}
    >
      {status}
    </Badge>
  );
}
