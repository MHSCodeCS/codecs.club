import { RoleGate } from "@/components/auth/RoleGate";

export default function LearnLayout({ children }: LayoutProps<"/learn">) {
  return <RoleGate role="student">{children}</RoleGate>;
}
