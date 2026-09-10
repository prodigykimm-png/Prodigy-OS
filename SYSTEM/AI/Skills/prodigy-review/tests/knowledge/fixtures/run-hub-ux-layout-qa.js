"use strict";
// Isolated HTML render, not a live Obsidian session. Completion is signalled by
// Chrome's actual screenshot receipt AND the serialized fixture DOM, never a sleep.
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { spawn } = require("node:child_process"), { pathToFileURL } = require("node:url");
const assert = require("node:assert/strict");
async function render(width, evidence) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-hub-ux-layout-"));
  const name = `layout-${width}`, screenshot = path.join(evidence, `${name}.png`);
  let stdout = "", stderr = "", received = false;
  const child = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless", "--disable-gpu", "--run-all-compositor-stages-before-draw", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--disable-component-update", "--disable-sync", `--user-data-dir=${profile}`, "--window-size=1400,1000", `--screenshot=${screenshot}`, "--dump-dom", pathToFileURL(path.join(__dirname, "hub-ux-workspace.html")).href + `?width=${width}`], { stdio: ["ignore", "pipe", "pipe"] });
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { child.kill("SIGTERM"); reject(new Error(`render_timeout:${width}`)); }, 20000);
      const complete = () => {
        if (!received && stdout.includes('data-fixture-ready="true"') && stderr.includes(`bytes written to file ${screenshot}`)) { received = true; child.kill("SIGTERM"); }
      };
      child.stdout.on("data", chunk => { stdout += chunk; complete(); });
      child.stderr.on("data", chunk => { stderr += chunk; complete(); });
      child.once("error", error => { clearTimeout(timeout); reject(error); });
      child.once("exit", () => { clearTimeout(timeout); if (received) resolve(); else reject(new Error(`render_exited_without_receipt:${width}`)); });
    });
    fs.writeFileSync(path.join(evidence, `${name}.html`), stdout);
    fs.writeFileSync(path.join(evidence, `${name}.log`), stderr);
    const match = /<output id="geometry">(.*?)<\/output>/su.exec(stdout);
    assert.ok(match, "geometry receipt required");
    const geometry = JSON.parse(match[1].replace(/&quot;/gu, '"').replace(/&amp;/gu, "&"));
    assert.equal(geometry.steps, 4); assert.equal(geometry.decision_stays_visible, true); assert.equal(geometry.horizontal_overflow, false);
    assert.equal(geometry.reading_scrolls, true); assert.equal(geometry.body_overflow, "hidden");
    assert.equal(geometry.body_padding, "0px"); assert.equal(geometry.toolbar_padding, "16px"); assert.ok(geometry.toolbar_height >= 52);
    assert.equal(geometry.ack_default, false); assert.equal(geometry.decision_status, true);
    assert.ok(geometry.title_width > 0); assert.notEqual(geometry.title_display, "none");
    assert.equal(geometry.proposal_selector, width < 900 ? "block" : "none");
    if (width >= 900) assert.equal(geometry.sidebar_width, 224);
    return geometry;
  } finally {
    child.kill("SIGTERM"); child.stdout.destroy(); child.stderr.destroy();
    fs.rmSync(profile, { recursive: true, force: true });
    assert.equal(fs.existsSync(profile), false);
  }
}
(async () => {
  const evidence = process.argv[2]; if (!evidence) throw new Error("evidence_directory_required");
  fs.mkdirSync(evidence, { recursive: true });
  const rows = [];
  for (const width of [1120, 820, 390]) rows.push(await render(width, evidence));
  fs.writeFileSync(path.join(evidence, "layout-geometry.json"), JSON.stringify(rows, null, 2));
  console.log(JSON.stringify({ ok: true, geometry: rows, cleanup: "isolated browser profiles removed" }));
})().catch(error => { console.error(error); process.exitCode = 1; });
