export const STATUS_COLORS: Record<string, string> = {
  pending: "#404854",
  red: "#EC9A3C",
  green: "#238551",
  blocked: "#CD4246",
  stale: "#8F4B2E",
};

export const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  red: "In Progress",
  green: "Done",
  blocked: "Blocked",
};

export const ROW_HEIGHT = 24;
export const ROW_GAP = 4;
export const ROW_TOTAL = ROW_HEIGHT + ROW_GAP;
export const LABEL_WIDTH = 220;
export const SPRINT_HEADER_HEIGHT = 32;
export const MS_PER_HOUR = 3600000;

export const ZOOM_PRESETS = [
  { label: "Day", hours: 24 },
  { label: "3d", hours: 72 },
  { label: "Week", hours: 168 },
  { label: "All", hours: 0 },
] as const;

export function isStaleTask(t: { status: string; startedAt: string | null }): boolean {
  if (t.status !== "red" || !t.startedAt) return false;
  return Date.now() - new Date(t.startedAt).getTime() > 48 * 60 * 60 * 1000;
}

export function barColor(status: string, stale: boolean): string {
  if (stale) return STATUS_COLORS.stale;
  return STATUS_COLORS[status] ?? "#404854";
}

export function taskKey(sprint: string, taskNum: number): string {
  return `${sprint}::${taskNum}`;
}

export function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt) return "—";
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const hours = (end - start) / (1000 * 60 * 60);
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

export function formatMinutes(mins: number | null): string {
  if (mins == null) return "—";
  if (mins < 60) return `${Math.round(mins)}m`;
  return `${(mins / 60).toFixed(1)}h`;
}

export function relativeTime(ts: string | null): string {
  if (!ts) return "—";
  const diff = Date.now() - new Date(ts).getTime();
  const mins = diff / 60000;
  if (mins < 1) return "just now";
  if (mins < 60) return `${Math.round(mins)}m ago`;
  const hours = mins / 60;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function blowUpColor(ratio: number): string {
  if (ratio <= 1.2) return "#238551";
  if (ratio <= 2.0) return "#EC9A3C";
  return "#CD4246";
}

export function computeTicks(
  rangeStart: number,
  rangeEnd: number,
  pxPerHour: number
): { label: string; px: number }[] {
  let intervalHours: number;
  if (pxPerHour >= 30) intervalHours = 1;
  else if (pxPerHour >= 8) intervalHours = 6;
  else if (pxPerHour >= 1.5) intervalHours = 24;
  else intervalHours = 168;

  const intervalMs = intervalHours * MS_PER_HOUR;
  const firstTick = Math.ceil(rangeStart / intervalMs) * intervalMs;
  const ticks: { label: string; px: number }[] = [];

  for (let t = firstTick; t <= rangeEnd; t += intervalMs) {
    const d = new Date(t);
    let label: string;
    if (intervalHours <= 6) {
      label = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } else {
      label = d.toLocaleDateString([], { month: "short", day: "numeric" });
    }
    const px = ((t - rangeStart) / MS_PER_HOUR) * pxPerHour;
    ticks.push({ label, px });
  }
  return ticks;
}
