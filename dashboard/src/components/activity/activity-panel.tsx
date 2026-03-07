// ActivityPanel: Reusable activity feed component used as both side panel and fullscreen page.
"use client";

import { useQuery } from "@apollo/client/react";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { X, Maximize2, Minimize2, Search } from "lucide-react";
import { CONVERSATION_FEED_QUERY } from "@/lib/graphql/queries";
import { useGlobalFilters } from "@/hooks/use-global-filters";
import { Skeleton } from "@/components/ui/skeleton";
import {
  filterBySearch,
  filterByToolType,
  filterByDateRange,
  filterBySessionId,
  getUniqueToolTypes,
  type ActivitySession,
  type ActivityMessage,
} from "./activity-helpers";

// ── Helpers ─────────────────────────────────────────────

function fmtTime(ts: string | null): string {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtDate(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" };
  if (d.getFullYear() !== now.getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString([], opts);
}

function fmtDateKey(ts: string): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDuration(startedAt: string | null, endedAt: string | null): string {
  if (!startedAt || !endedAt) return "";
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

function sessionLabel(s: ActivitySession): string {
  const parts: string[] = [];
  if (s.sprint?.name) parts.push(`${s.sprint.name}${s.taskNum != null ? `#${s.taskNum}` : ""}`);
  if (s.taskTitle) parts.push(s.taskTitle);
  if (!parts.length) {
    const firstPrompt = s.messages.find((m) => m.role === "user" && m.content?.trim())?.content;
    if (firstPrompt) {
      const preview = firstPrompt.substring(0, 80).replace(/\n/g, " ");
      parts.push(preview + (firstPrompt.length > 80 ? "..." : ""));
    } else {
      const firstAssistant = s.messages.find((m) => m.role === "assistant" && m.content?.trim())?.content;
      if (firstAssistant) {
        const preview = firstAssistant.substring(0, 60).replace(/\n/g, " ");
        parts.push(preview + (firstAssistant.length > 60 ? "..." : ""));
      } else {
        parts.push(fmtTime(s.startedAt) || "Session");
      }
    }
  }
  return parts.join(" \u00b7 ");
}

const TOOL_COLORS: Record<string, string> = {
  Read: "#2D72D2", Edit: "#EC9A3C", Write: "#EC9A3C",
  Bash: "#238551", Grep: "#7157D9", Glob: "#7157D9",
  Task: "#238551", Skill: "#7157D9", WebSearch: "#2D72D2",
  WebFetch: "#2D72D2", NotebookEdit: "#EC9A3C",
  AskUserQuestion: "#EC9A3C", EnterPlanMode: "#2D72D2",
};

const DATE_HEADER_H = 25;

// ── Props ───────────────────────────────────────────────

export interface ActivityPanelProps {
  mode: "panel" | "fullscreen";
  sessionId?: string;
  onClose: () => void;
  onFullscreen?: () => void;
  onMinimize?: () => void;
}

// ── Panel ───────────────────────────────────────────────

export function ActivityPanel({
  mode,
  sessionId,
  onClose,
  onFullscreen,
  onMinimize,
}: ActivityPanelProps) {
  const { filters } = useGlobalFilters();
  const person = filters.person?.[0] ?? null;
  const isFullscreen = mode === "fullscreen";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Turbopack requires <any> for Apollo hooks
  const { data, loading, error } = useQuery<any>(CONVERSATION_FEED_QUERY, {
    variables: {
      limit: 100,
      ...(person ? { developer: person } : {}),
    },
    pollInterval: 10000,
  });

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [toolTypeFilter, setToolTypeFilter] = useState("");
  const [dateStart, setDateStart] = useState<string>("");
  const [dateEnd, setDateEnd] = useState<string>("");

  // Session expansion state
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
  const [allExpanded, setAllExpanded] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);

  const sessions: ActivitySession[] = useMemo(
    () => data?.conversationFeed ?? [],
    [data]
  );

  // Auto-scroll to bottom on first data load
  useEffect(() => {
    if (sessions.length > 0 && !hasScrolledRef.current && feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
      hasScrolledRef.current = true;
    }
  }, [sessions.length]);

  // Extract unique tool types for dropdown
  const toolTypes = useMemo(() => getUniqueToolTypes(sessions), [sessions]);

  // Apply all filters
  const filtered = useMemo(() => {
    let result = sessions;
    result = filterBySessionId(result, sessionId);
    result = filterBySearch(result, searchQuery);
    result = filterByToolType(result, toolTypeFilter);
    result = filterByDateRange(result, dateStart || null, dateEnd || null);
    return result;
  }, [sessions, sessionId, searchQuery, toolTypeFilter, dateStart, dateEnd]);

  // Group by date
  const dateGroups = useMemo(() => {
    const map = new Map<string, ActivitySession[]>();
    for (const s of filtered) {
      const dk = s.startedAt ? fmtDateKey(s.startedAt) : null;
      if (!dk) continue;
      if (!map.has(dk)) map.set(dk, []);
      map.get(dk)!.push(s);
    }
    for (const group of map.values()) {
      group.sort((a, b) =>
        new Date(a.startedAt!).getTime() - new Date(b.startedAt!).getTime()
      );
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([dk, group]) => ({
        dateKey: dk,
        date: fmtDate(group[0].startedAt!),
        sessions: group,
      }));
  }, [filtered]);

  const isSessionExpanded = useCallback((id: string) => {
    if (allExpanded) return true;
    return expandedSessions.has(id);
  }, [allExpanded, expandedSessions]);

  const toggleSession = useCallback((id: string) => {
    setExpandedSessions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    if (allExpanded) setAllExpanded(false);
  }, [allExpanded]);

  const toggleAll = useCallback(() => {
    if (allExpanded) {
      setAllExpanded(false);
      setExpandedSessions(new Set());
    } else {
      setAllExpanded(true);
    }
  }, [allExpanded]);

  const scrollToBottom = useCallback(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, []);

  // Loading state
  if (loading && !data) {
    return (
      <div className={`flex flex-col h-full bg-background ${!isFullscreen ? "border-l border-border" : ""}`}>
        <PanelHeader
          mode={mode}
          sessionCount={0}
          onClose={onClose}
          onFullscreen={onFullscreen}
          onMinimize={onMinimize}
        />
        <div className="flex-1 p-4 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 px-4 py-1.5 bg-card rounded-sm">
              <Skeleton className="h-3 w-3 shrink-0" />
              <Skeleton className="h-3 flex-1" />
              <Skeleton className="h-3 w-20 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`flex flex-col h-full bg-background ${!isFullscreen ? "border-l border-border" : ""}`}>
        <PanelHeader
          mode={mode}
          sessionCount={0}
          onClose={onClose}
          onFullscreen={onFullscreen}
          onMinimize={onMinimize}
        />
        <div className="flex items-center justify-center flex-1 text-[#CD4246] font-mono text-sm">
          Error: {error.message}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full bg-background ${!isFullscreen ? "border-l border-border" : ""}`}>
      {/* Header */}
      <PanelHeader
        mode={mode}
        sessionCount={filtered.length}
        allExpanded={allExpanded}
        onToggleAll={toggleAll}
        onScrollToBottom={scrollToBottom}
        onClose={onClose}
        onFullscreen={onFullscreen}
        onMinimize={onMinimize}
      />

      {/* Filter bar */}
      <div className="px-3 py-2 border-b border-border/30 bg-card space-y-1.5">
        {/* Search input */}
        <div className="flex items-center gap-1.5 bg-background rounded-sm border border-border/30 px-2 py-1">
          <Search size={12} className="text-muted-foreground/50 shrink-0" />
          <input
            type="text"
            placeholder="Search messages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="text-muted-foreground/40 hover:text-muted-foreground"
            >
              <X size={10} />
            </button>
          )}
        </div>

        {/* Dropdowns row */}
        <div className="flex items-center gap-1.5">
          {/* Tool type dropdown */}
          <select
            className="text-[10px] bg-background border border-border/30 rounded-sm px-1.5 py-0.5 text-foreground leading-none"
            value={toolTypeFilter}
            onChange={(e) => setToolTypeFilter(e.target.value)}
          >
            <option value="">All Tools</option>
            {toolTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          {/* Date range */}
          <input
            type="date"
            value={dateStart}
            onChange={(e) => setDateStart(e.target.value)}
            className="text-[10px] bg-background border border-border/30 rounded-sm px-1.5 py-0.5 text-foreground leading-none"
            placeholder="From"
          />
          <span className="text-[10px] text-muted-foreground/40">&ndash;</span>
          <input
            type="date"
            value={dateEnd}
            onChange={(e) => setDateEnd(e.target.value)}
            className="text-[10px] bg-background border border-border/30 rounded-sm px-1.5 py-0.5 text-foreground leading-none"
            placeholder="To"
          />

          {/* Clear filters */}
          {(searchQuery || toolTypeFilter || dateStart || dateEnd) && (
            <button
              onClick={() => {
                setSearchQuery("");
                setToolTypeFilter("");
                setDateStart("");
                setDateEnd("");
              }}
              className="text-[10px] text-muted-foreground/50 hover:text-foreground ml-auto"
            >
              Clear
            </button>
          )}
        </div>

        {/* Session scope indicator */}
        {sessionId && (
          <div className="text-[10px] text-[#2D72D2] font-mono">
            Scoped to session {sessionId.substring(0, 8)}...
          </div>
        )}
      </div>

      {/* Feed */}
      <div ref={feedRef} className="flex-1 min-h-0 overflow-y-auto font-mono text-xs" id="activity-feed">
        {dateGroups.length === 0 ? (
          <p className="text-muted-foreground p-6">
            {sessions.length === 0 ? "No sessions yet." : "No sessions match the current filters."}
          </p>
        ) : (
          dateGroups.map((dg) => (
            <div key={dg.dateKey}>
              <div
                className="sticky top-0 z-20 px-4 text-[11px] font-semibold text-muted-foreground bg-background border-b border-border/30 flex items-center"
                style={{ height: DATE_HEADER_H }}
              >
                {dg.date}
              </div>

              {dg.sessions.map((session, idx) => (
                <SessionBlock
                  key={`${session.sessionId}-${idx}`}
                  session={session}
                  expanded={isSessionExpanded(session.sessionId)}
                  onToggle={() => toggleSession(session.sessionId)}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Panel Header ────────────────────────────────────────

function PanelHeader({
  mode,
  sessionCount,
  allExpanded,
  onToggleAll,
  onScrollToBottom,
  onClose,
  onFullscreen,
  onMinimize,
}: {
  mode: "panel" | "fullscreen";
  sessionCount: number;
  allExpanded?: boolean;
  onToggleAll?: () => void;
  onScrollToBottom?: () => void;
  onClose: () => void;
  onFullscreen?: () => void;
  onMinimize?: () => void;
}) {
  const isFullscreen = mode === "fullscreen";

  return (
    <div className="flex items-center gap-2 px-3 py-2 shrink-0 border-b border-border">
      <h2 className="text-sm font-semibold leading-none">Activity</h2>
      <span className="text-xs text-muted-foreground font-mono leading-none">
        {sessionCount} Session{sessionCount !== 1 ? "s" : ""}
      </span>

      {onToggleAll && (
        <button
          onClick={onToggleAll}
          className="text-[10px] px-2 py-0.5 rounded-sm text-muted-foreground hover:text-foreground border border-border/30 hover:border-border/60 transition-colors leading-none"
        >
          {allExpanded ? "Collapse All" : "Expand All"}
        </button>
      )}

      {onScrollToBottom && (
        <button
          onClick={onScrollToBottom}
          className="text-[10px] px-2 py-0.5 rounded-sm text-muted-foreground hover:text-foreground border border-border/30 hover:border-border/60 transition-colors leading-none"
        >
          Latest
        </button>
      )}

      <div className="flex items-center gap-1 ml-auto">
        {isFullscreen && onMinimize ? (
          <button
            onClick={onMinimize}
            title="Minimize to panel"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <Minimize2 size={14} />
          </button>
        ) : onFullscreen ? (
          <button
            onClick={onFullscreen}
            title="Open fullscreen"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <Maximize2 size={14} />
          </button>
        ) : null}
        <button
          onClick={onClose}
          title="Close"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

// ── Session Block ───────────────────────────────────────

function SessionBlock({
  session,
  expanded,
  onToggle,
}: {
  session: ActivitySession;
  expanded: boolean;
  onToggle: () => void;
}) {
  const userCount = session.messages.filter((m) => m.role === "user").length;
  const duration = fmtDuration(session.startedAt, session.endedAt);

  return (
    <div className="border-b border-border/15">
      <div
        className="sticky z-10 flex items-center gap-2 px-4 py-1.5 bg-card border-b border-border/15 cursor-pointer select-none hover:bg-secondary transition-colors"
        style={{ top: DATE_HEADER_H }}
        onClick={onToggle}
      >
        <span className="text-muted-foreground/60 w-3 shrink-0 text-[10px]">
          {expanded ? "\u25BE" : "\u25B8"}
        </span>
        <span className="text-[11px] text-foreground/80 truncate flex-1 min-w-0">
          {sessionLabel(session)}
        </span>
        <span className="shrink-0 text-[10px] text-muted-foreground/50">
          {fmtTime(session.startedAt)}
          {session.endedAt ? `\u2013${fmtTime(session.endedAt)}` : ""}
        </span>
        {duration && (
          <span className="shrink-0 text-[10px] text-muted-foreground/40">
            {duration}
          </span>
        )}
        <span className="shrink-0 text-[10px] text-muted-foreground/40">
          {userCount} prompt{userCount !== 1 ? "s" : ""}
        </span>
      </div>

      {expanded && (
        <div className="py-0.5">
          {session.messages.map((msg, i) => (
            <MessageRow key={i} message={msg} developer={session.developer?.name ?? null} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Message Row ─────────────────────────────────────────

function MessageRow({ message, developer }: { message: ActivityMessage; developer: string | null }) {
  const [showFull, setShowFull] = useState(false);
  const isUser = message.role === "user";
  const hasText = !!message.content?.trim();
  const toolCount = message.toolCalls.length;

  if (!isUser && !hasText && toolCount === 0) return null;

  const time = fmtTime(message.timestamp);
  const userName = developer?.toUpperCase() || "YOU";

  if (isUser) {
    return (
      <div className="flex gap-0 border-l-2 border-[#2D72D2] bg-[#2D72D206] mx-1 my-px">
        <div className="shrink-0 w-[82px] pt-1.5 pr-2 text-right">
          <div className="text-[10px] font-bold text-[#2D72D2]">{userName}</div>
          <div className="text-[9px] text-muted-foreground/40">{time}</div>
        </div>
        <div className="flex-1 min-w-0 py-1.5 pr-3 text-foreground leading-relaxed whitespace-pre-wrap break-words">
          {message.content}
        </div>
      </div>
    );
  }

  const text = message.content || "";
  const isLong = text.length > 500;
  const displayText = isLong && !showFull ? text.substring(0, 400) + "..." : text;

  return (
    <div className="flex gap-0 mx-1 my-px">
      <div className="shrink-0 w-[82px] pt-1.5 pr-2 text-right">
        {(hasText || toolCount === 0) && (
          <>
            <div className="text-[10px] font-bold text-muted-foreground/50">CLAUDE</div>
            <div className="text-[9px] text-muted-foreground/30">{time}</div>
          </>
        )}
      </div>
      <div className="flex-1 min-w-0 py-1 pr-3">
        {hasText && (
          <div className="text-muted-foreground/70 leading-relaxed whitespace-pre-wrap break-words">
            {displayText}
            {isLong && (
              <button
                onClick={() => setShowFull(!showFull)}
                className="text-[10px] text-[#2D72D2] ml-1 hover:underline"
              >
                {showFull ? "less" : "more"}
              </button>
            )}
          </div>
        )}

        {toolCount > 0 && (
          <div className="flex flex-wrap items-center gap-1 mt-0.5">
            {message.toolCalls.map((tc, j) => {
              const color = TOOL_COLORS[tc.name] || "#738694";
              return (
                <span
                  key={j}
                  className="inline-flex items-center gap-1 text-[9px] px-1 py-0 rounded-sm"
                  style={{ backgroundColor: `${color}10`, color: `${color}CC` }}
                >
                  <span className="font-semibold">{tc.name}</span>
                  {tc.summary && (
                    <span className="opacity-50 truncate max-w-[200px]">{tc.summary}</span>
                  )}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
