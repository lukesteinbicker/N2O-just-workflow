"use client";

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

export function useRealtimeTable(table: string, onChange: () => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!supabase) return;

    const debounced = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(onChange, 500);
    };

    const client = supabase;
    const channel = client
      .channel(`realtime-${table}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        debounced
      )
      .subscribe();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      client.removeChannel(channel);
    };
  }, [table, onChange]);
}
