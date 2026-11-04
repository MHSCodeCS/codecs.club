// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

const mocks = vi.hoisted(() => ({ heartbeat: vi.fn(), disconnect: vi.fn(async () => null) }));
// Generated references are proxies, so identify them with Convex's reference utility.
import { getFunctionName } from "convex/server";
vi.mock("convex/react", () => ({
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) => getFunctionName(ref).endsWith(":disconnect") ? mocks.disconnect : mocks.heartbeat,
  useConvexConnectionState: () => ({ isWebSocketConnected: true }),
}));
import { StudentPresence } from "../components/workspace/useAssistancePresence";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); mocks.heartbeat.mockReset(); mocks.disconnect.mockClear(); });

test("tab/window changes bypass the throttle and queue updates behind an in-flight heartbeat", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let focused = true;
  vi.spyOn(document, "hasFocus").mockImplementation(() => focused);
  vi.spyOn(document, "hidden", "get").mockImplementation(() => !focused);
  let resolveFirst!: (value: { tokens: string[]; userId: string }) => void;
  mocks.heartbeat.mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }))
    .mockResolvedValue({ tokens: [], userId: "student" });
  const element = document.createElement("div");
  const root = createRoot(element);
  await act(async () => root.render(createElement(StudentPresence)));
  expect(mocks.heartbeat.mock.calls[0][0]).toMatchObject({ focused: true, active: true });
  focused = false;
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  expect(mocks.heartbeat).toHaveBeenCalledTimes(1);
  await act(async () => resolveFirst({ tokens: [], userId: "student" }));
  expect(mocks.heartbeat).toHaveBeenCalledTimes(2);
  expect(mocks.heartbeat.mock.calls[1][0]).toMatchObject({ focused: false, active: false });
  focused = true;
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(mocks.heartbeat.mock.calls[2][0]).toMatchObject({ focused: true, active: true });
  focused = false;
  await act(async () => window.dispatchEvent(new Event("blur")));
  expect(mocks.heartbeat.mock.calls[3][0]).toMatchObject({ focused: false, active: false });
  await act(async () => root.unmount());
});
