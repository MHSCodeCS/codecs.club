// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { defaultDesks } from "./classroomLayout";

const mocks = vi.hoisted(() => ({ save: vi.fn(async () => null), layout: {} as Record<string, unknown>, sourceLayout: {} as Record<string, unknown> }));
vi.mock("convex/react", () => ({ useQuery: (_ref: unknown, args?: { group: string } | string) => {
  if (!args) return [{ _id: "basic", group: "basic", name: "Current", year: "2026-27", status: "current" }, { _id: "advanced", group: "advanced", name: "Previous", year: "2025-26", status: "archived" }];
  return typeof args !== "string" && args.group === "advanced" ? mocks.sourceLayout : mocks.layout;
}, useMutation: () => mocks.save }));
import { ClassroomLayout } from "../components/admin/ClassroomLayout";
import type { FunctionReturnType } from "convex/server";
import { api } from "../convex/_generated/api";

afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ""; Reflect.deleteProperty(document, "elementFromPoint"); mocks.save.mockClear(); });
test("edit mode seats students, swaps occupants, rotates/removes desks, and only persists on Save", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { constructor(private cb: (entries: unknown[]) => void) {} observe() { this.cb([{ contentRect: { width: 1200 } }]); } disconnect() {} });
  mocks.layout = { revision: 0, fingerprint: "original", desks: defaultDesks(), seating: [{ studentId: "one", seat: 0 }, { studentId: "two", seat: null }] };
  const classroom = { year: "2026-27", help: [], active: [], online: [], students: [
    { student: { _id: "one", firstName: "Ada", lastName: "Lovelace", userId: "ada" }, workspaceId: null, task: null },
    { student: { _id: "two", firstName: "Grace", lastName: "Hopper", userId: "grace" }, workspaceId: null, task: null },
  ] } as unknown as FunctionReturnType<typeof api.assistance.classroom>;
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(createElement(ClassroomLayout, { classroom, group: "basic", selected: null, onPick: vi.fn(), status: () => "Offline" as const, onEditingChange: vi.fn() })));
  async function click(text: string) {
    const button = [...container.querySelectorAll("button")].find(b => b.textContent?.includes(text));
    expect(button, text).toBeTruthy();
    const menu = button!.closest("details");
    if (menu && !menu.open) await act(async () => menu.querySelector("summary")!.click());
    await act(async () => button!.click());
  }
  async function desk(index: number) { await act(async () => container.querySelector<HTMLButtonElement>(`button[aria-label^="Desk ${index},"]`)!.click()); }
  await click("Edit classroom");
  await click("+ Add desk");
  expect(container.querySelectorAll("[data-desk]")).toHaveLength(25);
  await click("Cancel");
  expect(container.querySelectorAll("[data-desk]")).toHaveLength(24);
  await click("Edit classroom");
  const rootElement = container.firstElementChild as HTMLElement;
  rootElement.setPointerCapture = vi.fn(); rootElement.hasPointerCapture = () => false;
  async function pointer(target: Element, name: string, x: number, y: number) {
    await act(async () => target.dispatchEvent(new MouseEvent(name, { bubbles: true, clientX: x, clientY: y, button: 0 })));
  }
  const grace = [...container.querySelectorAll("[data-student-sidebar] button")].find(b => b.textContent?.includes("Grace"))!;
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => container.querySelector('[data-desk="0"]') });
  await pointer(grace, "pointerdown", 1100, 200);
  await pointer(rootElement, "pointermove", 200, 200);
  await pointer(rootElement, "pointerup", 200, 200);
  expect(container.querySelector('[data-desk="0"]')?.textContent).toContain("Grace");
  expect(container.querySelector('[data-student-sidebar]')?.textContent).toContain("1 unseated");
  await click("Ada Lovelace"); await desk(2);
  await click("Grace Hopper"); await desk(2);
  expect(container.querySelector('[data-desk="1"]')?.textContent).toContain("Grace");
  await click("Rotate");
  await click("Remove desk");
  expect(container.querySelector('[data-desk="1"]')).toBeNull();
  expect(mocks.save).not.toHaveBeenCalled();
  await desk(1);
  await click("Rotate");
  const handle = container.querySelector('button[aria-label="Move desk 24"]')!;
  await pointer(handle, "pointerdown", 100, 100);
  await pointer(rootElement, "pointermove", 140, 124);
  await pointer(rootElement, "pointerup", 140, 124);
  await click("Save layout");
  expect(mocks.save).toHaveBeenCalledOnce();
  const saved = mocks.save.mock.calls[0] as unknown as [{ desks: { seat: number; rotation: number; x: number; y: number }[]; seating: { studentId: string; seat: number | null }[] }];
  expect(saved[0].desks).toHaveLength(23);
  expect(saved[0].desks.find(d => d.seat === 0)?.rotation).toBe(90);
  const moved = saved[0].desks.find(d => d.seat === 23)!;
  expect(moved.x).toBeGreaterThan(defaultDesks()[23].x);
  expect(moved.y).toBeGreaterThan(defaultDesks()[23].y);
  expect(saved[0].seating.find(s => s.studentId === "two")?.seat).toBeNull();
  expect(saved[0].seating.find(s => s.studentId === "one")?.seat).toBe(0);
  await act(async () => root.unmount());
});


test("import previews archived class desks, preserves only valid destination seats, and saves only on confirmation", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { constructor(private cb: (entries: unknown[]) => void) {} observe() { this.cb([{ contentRect: { width: 1200 } }]); } disconnect() {} });
  mocks.layout = { revision: 3, fingerprint: "destination", desks: defaultDesks(), seating: [{ studentId: "one", seat: 0 }, { studentId: "two", seat: 1 }] };
  mocks.sourceLayout = { revision: 20, fingerprint: "source", desks: [{ seat: 0, x: 160, y: -80, rotation: 90 }], seating: [{ studentId: "foreign", seat: 0 }] };
  const classroom = { year: "2026-27", help: [], active: [], online: [], students: [
    { student: { _id: "one", firstName: "Ada", lastName: "Lovelace", userId: "ada" }, workspaceId: null, task: null },
    { student: { _id: "two", firstName: "Grace", lastName: "Hopper", userId: "grace" }, workspaceId: null, task: null },
  ] } as unknown as FunctionReturnType<typeof api.assistance.classroom>;
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(createElement(ClassroomLayout, { classroom, group: "basic", selected: null, onPick: vi.fn(), status: () => "Offline" as const, onEditingChange: vi.fn() })));
  async function click(text: string) {
    const button = [...container.querySelectorAll("button")].find(b => b.textContent === text);
    expect(button, text).toBeTruthy();
    const menu = button!.closest("details");
    if (menu && !menu.open) await act(async () => menu.querySelector("summary")!.click());
    await act(async () => button!.click());
  }
  async function preview() {
    await click("Import room layout");
    const select = container.querySelector<HTMLSelectElement>('section[aria-label="Import room layout"] select')!;
    expect(select.textContent).toContain("Previous · 2025-26 · archived");
    await act(async () => { select.value = "advanced"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    await click("Preview layout");
  }
  await preview();
  expect(container.querySelectorAll("[data-desk]")).toHaveLength(1);
  expect(container.querySelector('[data-desk="0"]')?.textContent).toContain("Ada");
  expect(container.querySelector('[data-student-sidebar]')?.textContent).toContain("Grace");
  expect(mocks.save).not.toHaveBeenCalled();
  await click("Cancel");
  expect(container.querySelectorAll("[data-desk]")).toHaveLength(24);
  await preview();
  await click("Save layout");
  expect(mocks.save).toHaveBeenCalledWith({ group: "basic", revision: 3, fingerprint: "destination", desks: [{ seat: 0, x: 160, y: -80, rotation: 90 }], seating: [{ studentId: "one", seat: 0 }, { studentId: "two", seat: null }] });
  expect(mocks.sourceLayout.desks).toEqual([{ seat: 0, x: 160, y: -80, rotation: 90 }]);
  await act(async () => root.unmount());
});

test("an away student's desk stays red even when selected or waiting for help", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { constructor(private cb: (entries: unknown[]) => void) {} observe() { this.cb([{ contentRect: { width: 1200 } }]); } disconnect() {} });
  mocks.layout = { revision: 0, fingerprint: "away", desks: defaultDesks(), seating: [{ studentId: "one", seat: 0 }] };
  const classroom = { year: "2026-27", help: [{ studentId: "one" }], active: [], online: [], focused: [], students: [
    { student: { _id: "one", firstName: "Ada", lastName: "Lovelace", userId: "ada" }, workspaceId: null, task: null },
  ] } as unknown as FunctionReturnType<typeof api.assistance.classroom>;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(createElement(ClassroomLayout, { classroom, group: "basic", selected: null, selectedStudentId: classroom.students[0].student._id, onPick: vi.fn(), status: () => "Away" as const, onEditingChange: vi.fn() })));
  const desk = container.querySelector('[data-desk="0"]')!;
  expect(desk.querySelector('[aria-hidden="true"]')?.className).toContain("bg-cor-s");
  expect(desk.querySelector('button[aria-label^="Desk"]')?.getAttribute("aria-label")).toContain("Away");
  await act(async () => root.unmount());
});
