import { AdminGuard } from "@/components/layout/admin-guard";

export default function CapacityLayout({ children }: { children: React.ReactNode }) {
  return <AdminGuard>{children}</AdminGuard>;
}
