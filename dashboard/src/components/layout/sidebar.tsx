"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, ListTodo, Radio } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const nav = [
  { href: "/streams", icon: Radio, label: "Streams" },
  { href: "/tasks", icon: ListTodo, label: "Tasks" },
  { href: "/activity", icon: Activity, label: "Activity" },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-12 flex-col items-center border-r border-border bg-background py-3 gap-1">
      <div className="mb-3 h-4" />
      {nav.map(({ href, icon: Icon, label }) => {
        const active = pathname.startsWith(href);
        return (
          <Tooltip key={href} delayDuration={0}>
            <TooltipTrigger asChild>
              <Link
                href={href}
                className={`flex h-9 w-9 items-center justify-center rounded-md transition-colors ${
                  active
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <Icon size={18} />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              {label}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </aside>
  );
}
