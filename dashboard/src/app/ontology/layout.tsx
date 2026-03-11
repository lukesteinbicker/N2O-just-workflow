import { AdminGuard } from "@/components/layout/admin-guard";

export default function OntologyLayout({ children }: { children: React.ReactNode }) {
  return <AdminGuard>{children}</AdminGuard>;
}
