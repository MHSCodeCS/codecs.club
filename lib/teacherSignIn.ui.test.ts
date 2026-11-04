// @vitest-environment jsdom
import { expect, test, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
vi.mock("@convex-dev/auth/react", () => ({ useAuthActions: () => ({ signIn: vi.fn() }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("../components/auth/useViewer", () => ({ useViewer: () => ({ status: "signedOut" }), homeFor: () => "/" }));
import { LoginScreen } from "../components/auth/LoginScreen";

test("visible admin sign-in opens in one activation and focuses the username", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Element.prototype.scrollIntoView = vi.fn();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(createElement(LoginScreen)));
    const button = [...container.querySelectorAll("button")].find(b => b.textContent === "Admin sign in")!;
    expect(button).toBeTruthy();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    await act(async () => button.click());
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement?.id).toBe("admin-username");
    expect(container.querySelector("#teacher-sign-in")).toBeTruthy();
  } finally {
    await act(async () => root.unmount());
    container.remove(); vi.unstubAllGlobals();
  }
});
