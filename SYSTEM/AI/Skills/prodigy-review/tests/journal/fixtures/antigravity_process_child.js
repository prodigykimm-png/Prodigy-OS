"use strict";

const { spawn } = require("node:child_process");

const mode = process.argv[2];
const prefix = '{"status":"SUCCESS","structured_output":';
const suffix = '{"ok":true}}';

if (mode === "descendant-retain") {
  process.stdout.on("error", () => process.exit(0));
  process.stderr.on("error", () => process.exit(0));
  setTimeout(() => process.stderr.write("retained descendant released\n", () => process.exit(0)), 40);
} else if (mode === "descendant-drain") {
  setImmediate(() => {
    process.stderr.write("delayed bounded diagnostic\n");
    process.stdout.write(suffix, () => process.exit(0));
  });
} else if (mode === "exit-retained-stdio") {
  spawn(process.execPath, [__filename, "descendant-retain"], { stdio: ["ignore", process.stdout, process.stderr] });
  process.stdout.write(prefix + suffix, () => process.exit(0));
} else if (mode === "exit-delayed-drain") {
  spawn(process.execPath, [__filename, "descendant-drain"], { stdio: ["ignore", process.stdout, process.stderr] });
  process.stdout.write(prefix, () => process.exit(0));
} else if (mode === "normal-close") {
  process.stdout.write(prefix + suffix);
} else {
  process.exitCode = 64;
}
