import { expect, test } from "vitest";
import { avatarColors, studentAvatarColor } from "./studentAvatars";

test("only the four approved colors are assigned; gray replacements are stable", () => {
  expect(avatarColors).toEqual(["#5ee8bf", "#b8a8ff", "#ffd27a", "#ff9f85"]);
  for (const color of avatarColors) expect(studentAvatarColor({ _id: "student", avatarColor: color })).toBe(color);
  for (const avatarColor of ["#7f938a", "#a9b8b1", undefined]) {
    const assigned = studentAvatarColor({ _id: "student", avatarColor });
    expect(avatarColors).toContain(assigned);
    expect(studentAvatarColor({ _id: "student", avatarColor: assigned })).toBe(assigned);
  }
});
