"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { RealObsidianHarness, snapshotProtected } = require("../shared/real_obsidian_harness.js");

test("real Obsidian mounts and displays the synthetic watching auction card", { timeout: 300000 }, async (t) => {
  let protectedSnapshot;
  try {
    protectedSnapshot = snapshotProtected();
  } catch (error) {
    return t.skip(`real Obsidian prerequisite unavailable: ${error.message}`);
  }

  const harness = await RealObsidianHarness.start("auction-watching-card", { protectedSnapshot });
  try {
    await harness.openWorkspace("auction");
    const receipt = await harness.evaluate(`(async () => {
      const preview = document.querySelector(".markdown-preview-view");
      if (!preview) throw new Error("AUCTION_PREVIEW_MISSING");

      const waitForMutation = () => new Promise((resolve) => {
        const observer = new MutationObserver(() => {
          observer.disconnect();
          resolve(true);
        });
        observer.observe(preview, { childList: true, subtree: true });
        setTimeout(() => {
          observer.disconnect();
          resolve(false);
        }, 2000);
      });

      for (let step = 0; step < 20; step += 1) {
        const card = document.querySelector(".auction-hub-watching .auction-card");
        if (card) {
          const style = getComputedStyle(card);
          const rect = card.getBoundingClientRect();
          return {
            mounted: true,
            visible: style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0,
            label: card.getAttribute("aria-label"),
          };
        }
        const mutation = waitForMutation();
        preview.scrollTop = Math.min(
          preview.scrollTop + Math.max(preview.clientHeight * 0.8, 120),
          preview.scrollHeight,
        );
        preview.dispatchEvent(new Event("scroll", { bubbles: true }));
        await mutation;
      }
      return {
        mounted: false,
        sections: Array.from(document.querySelectorAll(".auction-hub-section")).map((section) => section.className),
      };
    })()`);

    assert.equal(receipt.mounted, true, `watching section did not mount: ${JSON.stringify(receipt.sections || [])}`);
    assert.equal(receipt.visible, true, "watching auction card must have a visible box");
    assert.match(receipt.label, /관심 경매 카드/);
  } finally {
    const cleanup = await harness.close();
    assert.equal(cleanup.audit.equal, true, "cloned vault must remain read-only");
    assert.equal(cleanup.protectedContinuity.exact, true, "installed Obsidian must remain untouched");
    assert.equal(cleanup.removed, true, "cloned runtime must be removed");
    assert.equal(cleanup.portReusable, true, "cloned runtime port must be released");
  }
});
