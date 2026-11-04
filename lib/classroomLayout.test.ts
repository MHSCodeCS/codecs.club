import { expect, test } from "vitest";
import { defaultDesks, roomBounds } from "./classroomLayout";

test("room fits negative positions, rotated desks, desk removal and empty rooms", () => {
  const desks = [{ seat: 0, x: -40, y: -80, rotation: 90 }, { seat: 1, x: 500, y: 300, rotation: 0 }];
  expect(roomBounds(desks)).toEqual({ x: -56, y: -96, width: 700, height: 516 });
  expect(roomBounds(desks.slice(0, 1))).toEqual({ x: -56, y: -96, width: 160, height: 160 });
  expect(roomBounds([]).width).toBeGreaterThan(0);
  expect(defaultDesks(59)).toHaveLength(60);
  expect(defaultDesks()).toHaveLength(24);
});
