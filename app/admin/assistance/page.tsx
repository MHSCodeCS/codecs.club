import type { Metadata } from "next";
import { AssistanceScreen } from "@/components/admin/AssistanceScreen";

export const metadata: Metadata = { title: "Assistance" };

export default function AssistancePage() {
  return <AssistanceScreen />;
}
