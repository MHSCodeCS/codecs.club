import { AdminShell } from "@/components/admin/AdminShell";
import { RoleGate } from "@/components/auth/RoleGate";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <RoleGate role="admin">
      <AdminShell>{children}</AdminShell>
    </RoleGate>
  );
}
