"use client";

import { ClassesSettings } from "./ClassesSettings";
import { StaffSettings } from "./StaffSettings";

export function SettingsScreen() {
  return <main className="flex max-w-4xl flex-col gap-4 px-4 md:px-7 pt-4 pb-10">
    <h1 className="m-0 text-[34px] md:text-[46px] leading-[1.04] font-extrabold tracking-[-.035em]">Settings</h1>
    <ClassesSettings />
    <StaffSettings />
  </main>;
}
