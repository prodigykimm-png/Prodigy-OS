(function (root) {
  "use strict";

  const EFFECTS = Object.freeze(["card", "sections", "none"]);

  function create(options) {
    const opts = options || {};
    if (!opts.app?.vault || !opts.app?.fileManager?.processFrontMatter) {
      throw new TypeError("Auction card mutation requires the Obsidian file manager.");
    }
    if (!opts.auction || typeof opts.auction !== "object") {
      throw new TypeError("Auction card mutation requires a live Auction object.");
    }
    const filePath = String(opts.filePath || opts.auction.file?.path || "");
    if (!filePath) throw new TypeError("Auction card mutation requires an Auction object path.");

    async function commit(command) {
      const input = command || {};
      const patch = input.patch && typeof input.patch === "object" ? { ...input.patch } : {};
      const effect = input.effect || "card";
      if (!EFFECTS.includes(effect)) throw new TypeError(`Unsupported Auction mutation effect: ${effect}`);
      if (effect === "card" && typeof opts.redraw !== "function") {
        throw new TypeError("Auction card mutation requires a card redraw handler.");
      }
      if (effect === "sections" && typeof opts.refresh !== "function") {
        throw new TypeError("Auction card mutation requires a section refresh handler.");
      }
      const file = opts.app.vault.getAbstractFileByPath(filePath);
      if (!file) throw new Error("옥션카드 원본 파일을 찾지 못했습니다.");
      const updatedPatch = {
        ...patch,
        updated: typeof opts.today === "function"
          ? opts.today()
          : new Date().toISOString().split("T")[0],
      };
      const notify = (state, fields) => {
        if (typeof opts.onState !== "function") return;
        opts.onState({ state, patch: updatedPatch, ...(fields || {}) });
      };

      notify("saving");
      try {
        await opts.app.fileManager.processFrontMatter(file, (frontmatter) => {
          Object.assign(frontmatter, updatedPatch);
        });
        Object.assign(opts.auction, updatedPatch);
        if (typeof input.afterPersist === "function") {
          await input.afterPersist(file, updatedPatch);
        }
        let target = null;
        if (effect === "card" && typeof opts.redraw === "function") {
          target = opts.redraw(updatedPatch, input.focusKey);
        } else if (effect === "sections" && typeof opts.refresh === "function") {
          await opts.refresh(file);
        }
        notify("saved", { target });
        return Object.freeze({ file, patch: Object.freeze(updatedPatch), effect });
      } catch (error) {
        notify("error", { error });
        throw error;
      }
    }

    return Object.freeze({ commit });
  }

  const api = Object.freeze({ EFFECTS, create });
  root.AuctionCardMutation = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
