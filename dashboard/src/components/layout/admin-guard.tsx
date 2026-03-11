"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/lib/use-current-user";

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading } = useCurrentUser();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isAdmin) {
      router.replace("/");
    }
  }, [loading, isAdmin, router]);

  if (loading) return null;
  if (!isAdmin) return null;

  return <>{children}</>;
}
