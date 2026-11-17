import type { Metadata } from "next";
import { MyWork } from "@/components/student/MyWork";

export const metadata: Metadata = { title: "My work" };

export default function WorkPage() {
  return <MyWork />;
}
