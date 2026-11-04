// @vitest-environment jsdom
import { expect, test, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { UnsavedWorkProvider, useConfirmLeave, useUnsavedWork } from "../components/admin/UnsavedWork";

test.each(["assignment", "attendance"])("%s drafts guard navigation and class changes until saved or discarded", async label => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const navigate = vi.fn();
  const changeClass = vi.fn();
  function Screen({ dirty }: { dirty: boolean }) {
    useUnsavedWork(dirty, label);
    const leave = useConfirmLeave();
    return createElement("div", null,
      createElement("button", { onClick: () => { if (leave()) navigate(); } }, "Navigate"),
      createElement("button", { onClick: () => { if (leave()) changeClass(); } }, "Class"));
  }
  const container = document.createElement("div");
  const root = createRoot(container);
  const render = (dirty: boolean) => act(async () => root.render(createElement(UnsavedWorkProvider, null, createElement(Screen, { dirty }))));
  try {
    await render(true);
    const buttons = container.querySelectorAll("button");
    await act(async () => { buttons[0].click(); buttons[1].click(); });
    expect(navigate).not.toHaveBeenCalled();
    expect(changeClass).not.toHaveBeenCalled();
    expect(confirm).toHaveBeenCalledWith(`Discard unsaved ${label} changes?`);
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    confirm.mockReturnValue(true);
    await act(async () => buttons[1].click());
    expect(changeClass).toHaveBeenCalledOnce();
    await render(false);
    confirm.mockClear();
    await act(async () => buttons[0].click());
    expect(navigate).toHaveBeenCalledOnce();
    expect(confirm).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    vi.restoreAllMocks(); vi.unstubAllGlobals();
  }
});
