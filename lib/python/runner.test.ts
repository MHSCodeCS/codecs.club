// @vitest-environment node
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { loadPyodide, type PyodideAPI } from "pyodide";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { PYODIDE_VERSION } from "./config";
import {
  chooseEntry,
  explainInstallError,
  installRunner,
  packageSpecProblem,
  runEntry,
  writeWorkspace,
} from "./runner";

const require = createRequire(import.meta.url);
const pyodideDir = dirname(require.resolve("pyodide/package.json"));

let pyodide: PyodideAPI;
let out = "";
let err = "";
let onWrite: (() => void) | null = null;
let stdinLines: string[] = [];

beforeAll(async () => {
  pyodide = await loadPyodide({ indexURL: `${pyodideDir}/` });
  pyodide.setStdout({
    batched: (text: string) => {
      out += text + "\n";
      onWrite?.();
    },
  });
  pyodide.setStderr({ batched: (text: string) => void (err += text + "\n") });
  pyodide.setStdin({ stdin: () => stdinLines.shift() ?? null });
  installRunner(pyodide);
}, 60_000);

beforeEach(() => {
  out = "";
  err = "";
  onWrite = null;
  stdinLines = [];
});

describe("running student files", () => {
  test("runs main.py as __main__ and captures output", () => {
    writeWorkspace(pyodide, [
      { name: "main.py", content: 'print("hi")\nprint(__name__)\n' },
    ]);
    expect(runEntry(pyodide, "main.py")).toBe("ok");
    expect(out).toBe("hi\n__main__\n");
  });

  test("imports other workspace files and reloads them after edits", () => {
    writeWorkspace(pyodide, [
      { name: "main.py", content: "import helpers\nprint(helpers.greet())\n" },
      { name: "helpers.py", content: 'def greet():\n    return "v1"\n' },
    ]);
    runEntry(pyodide, "main.py");
    writeWorkspace(pyodide, [
      { name: "main.py", content: "import helpers\nprint(helpers.greet())\n" },
      { name: "helpers.py", content: 'def greet():\n    return "v2"\n' },
    ]);
    runEntry(pyodide, "main.py");
    expect(out).toBe("v1\nv2\n");
  });

  test("each run starts fresh: old variables and deleted files are gone", () => {
    writeWorkspace(pyodide, [
      { name: "main.py", content: "x = 5\n" },
      { name: "data.txt", content: "old" },
    ]);
    runEntry(pyodide, "main.py");
    writeWorkspace(pyodide, [
      {
        name: "main.py",
        content: "import os\nprint('x' in globals(), os.path.exists('data.txt'))\n",
      },
    ]);
    runEntry(pyodide, "main.py");
    expect(out).toBe("False False\n");
  });

  test("tracebacks point at the student's file, not the runner", () => {
    writeWorkspace(pyodide, [
      { name: "main.py", content: 'name = "Ada"\nprint("Hello,", nam)\n' },
    ]);
    expect(runEntry(pyodide, "main.py")).toBe("error");
    expect(err).toContain('File "main.py", line 2');
    expect(err).toContain("NameError: name 'nam' is not defined");
    expect(err).not.toContain("runpy");
    expect(err).not.toContain("_codecs_runner");
  });

  test("errors in imported files show the file name without the work folder", () => {
    writeWorkspace(pyodide, [
      { name: "main.py", content: "import helpers\nhelpers.boom()\n" },
      { name: "helpers.py", content: "def boom():\n    return 1 / 0\n" },
    ]);
    expect(runEntry(pyodide, "main.py")).toBe("error");
    expect(err).toContain('File "helpers.py", line 2');
    expect(err).toContain("ZeroDivisionError");
    expect(err).not.toContain("/home/pyodide/work");
  });

  test("syntax errors are reported as errors", () => {
    writeWorkspace(pyodide, [{ name: "main.py", content: "print('missing'\n" }]);
    expect(runEntry(pyodide, "main.py")).toBe("error");
    expect(err).toMatch(/SyntaxError/);
  });

  test("input() reads typed lines and shows the prompt", () => {
    stdinLines = ["Ada"];
    writeWorkspace(pyodide, [
      { name: "main.py", content: 'name = input("Name? ")\nprint("Hello,", name)\n' },
    ]);
    expect(runEntry(pyodide, "main.py")).toBe("ok");
    expect(out).toContain("Name? ");
    expect(out).toContain("Hello, Ada\n");
  });

  test("sys.exit(0) is a normal finish; other codes are errors", () => {
    writeWorkspace(pyodide, [{ name: "main.py", content: "import sys\nsys.exit(0)\n" }]);
    expect(runEntry(pyodide, "main.py")).toBe("ok");
    writeWorkspace(pyodide, [{ name: "main.py", content: "import sys\nsys.exit(3)\n" }]);
    expect(runEntry(pyodide, "main.py")).toBe("error");
  });

  test("an interrupt stops an infinite loop and keeps the output so far", () => {
    const interrupt = new Uint8Array(new SharedArrayBuffer(1));
    pyodide.setInterruptBuffer(interrupt);
    let lines = 0;
    onWrite = () => {
      lines += 1;
      if (lines === 50) interrupt[0] = 2;
    };
    writeWorkspace(pyodide, [
      { name: "main.py", content: "i = 0\nwhile True:\n    print(i)\n    i += 1\n" },
    ]);
    expect(runEntry(pyodide, "main.py")).toBe("stopped");
    expect(out.startsWith("0\n1\n2\n")).toBe(true);
    expect(lines).toBeGreaterThanOrEqual(50);
    expect(err).toBe("");
    interrupt[0] = 0;
  });

  test("the default lesson modules work without downloads", () => {
    writeWorkspace(pyodide, [
      { name: "scores.csv", content: "name,score\nAda,9\nBo,7\n" },
      {
        name: "main.py",
        content: [
          "import math, random, statistics, decimal, fractions, collections, itertools, json, csv",
          "random.seed(1)",
          "rows = list(csv.DictReader(open('scores.csv')))",
          "print(math.sqrt(16), statistics.mean([1, 2, 3]), decimal.Decimal('0.1') + decimal.Decimal('0.2'))",
          "print(fractions.Fraction(1, 3) * 3, collections.Counter('aab')['a'], list(itertools.islice(itertools.count(), 3)))",
          "print(json.dumps({'n': len(rows)}), rows[0]['name'], 1 <= random.randint(1, 6) <= 6)",
        ].join("\n"),
      },
    ]);
    expect(runEntry(pyodide, "main.py")).toBe("ok");
    expect(err).toBe("");
    expect(out).toBe('4.0 2 0.3\n1 2 [0, 1, 2]\n{"n": 2} Ada True\n');
  });
});

describe("checks observe endless loops for 1,000 rounds", () => {
  const lines = () => out.split("\n").filter(Boolean);
  const observe = (files: Array<{ name: string; content: string }>) => {
    writeWorkspace(pyodide, files);
    return runEntry(pyodide, "main.py", { observeLoops: true });
  };

  test("an endless greeter stops after exactly 1,000 rounds, which is not an error", () => {
    stdinLines = ["Ada"];
    const outcome = observe([
      { name: "main.py", content: 'name = input("Name? ")\nwhile True:\n    print("Hello,", name)\n' },
    ]);
    expect(outcome).toBe("limit");
    expect(err).toBe("");
    expect(out.match(/Hello, Ada/g)).toHaveLength(1000);
  });

  test("rounds are counted, not printed lines: two prints per round, nested finite loops, no prints", () => {
    expect(observe([{ name: "main.py", content: "while True:\n    print('a')\n    print('b')\n" }])).toBe("limit");
    expect(lines()).toHaveLength(2000);
    out = "";
    expect(
      observe([{ name: "main.py", content: "while True:\n    for j in range(3):\n        print(j)\n" }]),
    ).toBe("limit");
    expect(lines()).toHaveLength(3000);
    out = "";
    expect(observe([{ name: "main.py", content: "i = 0\nwhile True:\n    i += 1\n" }])).toBe("limit");
    expect(out).toBe("");
  });

  test("loops in imported workspace files are observed too", () => {
    const outcome = observe([
      { name: "main.py", content: "import helpers\nhelpers.forever()\n" },
      { name: "helpers.py", content: "def forever():\n    while True:\n        print('x')\n" },
    ]);
    expect(outcome).toBe("limit");
    expect(lines()).toHaveLength(1000);
  });

  test("finite programs finish normally and errors keep their line numbers", () => {
    expect(observe([{ name: "main.py", content: "for i in range(10):\n    print(i)\nprint('Done!')\n" }])).toBe("ok");
    expect(lines()).toHaveLength(11);
    expect(observe([{ name: "main.py", content: "x = 1\nwhile True:\n    print(x)\n    x = x / 0\n" }])).toBe("error");
    expect(err).toContain('File "main.py", line 4');
  });

  test("a normal run after a check has no loop counters left over", () => {
    observe([{ name: "main.py", content: "while True:\n    pass\n" }]);
    writeWorkspace(pyodide, [{ name: "main.py", content: "for i in range(1200):\n    pass\nprint('ran all 1200')\n" }]);
    expect(runEntry(pyodide, "main.py")).toBe("ok");
    expect(out).toContain("ran all 1200");
  });
});

describe("helpers", () => {
  test("the served Pyodide version matches the installed package", () => {
    const pkg = JSON.parse(readFileSync(`${pyodideDir}/package.json`, "utf8")) as { version: string };
    expect(PYODIDE_VERSION).toBe(pkg.version);
  });

  test("Run prefers main.py, then the shown .py file", () => {
    expect(chooseEntry(["helpers.py", "main.py"], "helpers.py", "main.py")).toBe("main.py");
    expect(chooseEntry(["art.py", "notes.txt"], "art.py", "main.py")).toBe("art.py");
    expect(chooseEntry(["notes.txt", "game.py"], "notes.txt", "main.py")).toBe("game.py");
    expect(chooseEntry(["notes.txt"], "notes.txt", "main.py")).toBeNull();
  });

  test("install failures become readable messages", () => {
    expect(explainInstallError("pandas-x", "ValueError: Can't find a pure Python 3 wheel for 'pandas-x'")).toMatch(
      /can’t be installed in the browser/,
    );
    expect(explainInstallError("emjoi", "ValueError: Can't fetch metadata for 'emjoi'")).toMatch(
      /Couldn’t find a package named “emjoi”/,
    );
    expect(packageSpecProblem("emoji")).toBeNull();
    expect(packageSpecProblem("emoji==2.12.1")).toBeNull();
    expect(packageSpecProblem("emoji; rm -rf")).not.toBeNull();
  });
});
