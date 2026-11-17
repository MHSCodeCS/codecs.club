import { StudentShell } from "@/components/student/StudentShell";

export default function StudentShellLayout({ children }: { children: React.ReactNode }) {
  return <StudentShell>{children}</StudentShell>;
}
