import type { Metadata } from "next";
import { SettingsScreen } from "@/components/admin/SettingsScreen";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return <SettingsScreen />;
}
