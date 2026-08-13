"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { RealObsidianHarness, snapshotProtected } = require("../shared/real_obsidian_harness.js");

test("real Obsidian Journal delegates iPad portrait and landscape vertical scrolling to Markdown preview", { timeout: 300000 }, async (t) => {
  let protectedSnapshot;
  try {
    protectedSnapshot = snapshotProtected();
  } catch (error) {
    return t.skip(`real Obsidian prerequisite unavailable: ${error.message}`);
  }
  const harness = await RealObsidianHarness.start("journal-preview-scroll", { protectedSnapshot });
  try {
    await harness.openWorkspace("journal");

    for (const width of [834, 1194]) {
      await harness.setMetricsAndAwaitResize("journal", width, 1);
      const receipt = await harness.evaluate(`(()=>{
        const shell = document.querySelector('.prodigy-app-shell[data-workspace-id="journal"]');
        const body = shell && shell.querySelector(':scope > .prodigy-app-shell-body');
        const preview = shell && shell.closest('.markdown-preview-view');
        if (!shell || !body || !preview) throw new Error('TASK13A_JOURNAL_SCROLL_SURFACE_MISSING');
        document.querySelectorAll('[data-task13a-journal-scroll-probe]').forEach(node => node.remove());
        const probe = document.createElement('div');
        probe.setAttribute('data-task13a-journal-scroll-probe', 'true');
        probe.style.blockSize = '2400px';
        body.appendChild(probe);
        const shellStyle = getComputedStyle(shell);
        const bodyStyle = getComputedStyle(body);
        preview.scrollTop = 0;
        shell.scrollTop = 0;
        body.scrollTop = 0;
        preview.scrollTop = 180;
        preview.dispatchEvent(new Event('scroll', { bubbles: true }));
        const result = {
          width: innerWidth,
          shell: { overflowY: shellStyle.overflowY, maxBlockSize: shellStyle.maxBlockSize, scrollTop: shell.scrollTop },
          body: { overflowY: bodyStyle.overflowY, overscrollBehaviorBlock: bodyStyle.overscrollBehaviorBlock, scrollTop: body.scrollTop },
          preview: { scrollTop: preview.scrollTop, clientHeight: preview.clientHeight, scrollHeight: preview.scrollHeight }
        };
        probe.remove();
        return result;
      })()`);

      assert.equal(receipt.width, width);
      assert.equal(receipt.shell.overflowY, "visible", `${width}px Journal shell must not cap vertical scrolling`);
      assert.equal(receipt.shell.maxBlockSize, "none", `${width}px Journal shell must not impose a viewport height`);
      assert.equal(receipt.body.overflowY, "visible", `${width}px Journal body must not become the scroll owner`);
      assert.equal(receipt.body.overscrollBehaviorBlock, "auto", `${width}px Journal body must allow preview scrolling`);
      assert.equal(receipt.shell.scrollTop, 0, `${width}px shell must not consume scroll`);
      assert.equal(receipt.body.scrollTop, 0, `${width}px shell body must not consume scroll`);
      assert.ok(receipt.preview.scrollHeight > receipt.preview.clientHeight, `${width}px Markdown preview must contain the tall Journal fixture`);
      assert.equal(receipt.preview.scrollTop, 180, `${width}px Markdown preview must consume vertical scroll`);
    }
  } finally {
    const cleanup = await harness.close();
    assert.equal(cleanup.audit.equal, true, "cloned vault must stay read-only");
    assert.equal(cleanup.protectedContinuity.exact, true, "installed Obsidian must remain untouched");
    assert.equal(cleanup.removed, true, "cloned runtime must be removed");
    assert.equal(cleanup.portReusable, true, "cloned runtime port must be released");
  }
});
