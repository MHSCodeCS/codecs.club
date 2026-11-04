import { expect, test } from "vitest";
import { parseRosterCsv } from "./rosterCsv";

test("CSV accepts BOM, CRLF, quoted commas, escaped quotes, embedded newlines and empty codes", () => {
  expect(parseRosterCsv('\uFEFFFirst,Last,Code\r\nAda,"Love,lace",\r\n"Grace\nHopper","A ""quote""",gh\r\n')).toEqual([
    ["First", "Last", "Code"], ["Ada", "Love,lace", ""], ["Grace\nHopper", 'A "quote"', "gh"],
  ]);
});
test("malformed files and oversized imports are refused", () => {
  for (const csv of ['First,Last\n"Ada,Lovelace', 'First,Last\nAda', 'First,Last\n"Ada"oops,Lovelace', 'First,Last\nA"da,Lovelace', 'First,Last']) expect(() => parseRosterCsv(csv)).toThrow();
  expect(() => parseRosterCsv('First,Last\n' + 'Ada,Lovelace\n'.repeat(101))).toThrow(/100/);
  expect(() => parseRosterCsv('a'.repeat(1_000_001))).toThrow(/1 MB/);
});
