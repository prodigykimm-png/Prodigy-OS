(function (root) {
  "use strict";

  function getBaseDir(date) {
    return `SYSTEM/AI/Skills/prodigy-review/runs/morning/${date}`;
  }

  async function ensureFolder(app, folderPath) {
    if (!app || !app.vault || !folderPath) return;
    if (app.vault.getAbstractFileByPath(folderPath)) return;
    const parts = folderPath.split("/");
    let current = "";
    for (const part of parts) {
      if (!part) continue;
      current = current ? `${current}/${part}` : part;
      if (!app.vault.getAbstractFileByPath(current)) {
        try {
          await app.vault.createFolder(current);
        } catch (_e) {
          try {
            await app.vault.adapter.mkdir(current);
          } catch (_err) {}
        }
      }
    }
  }

  async function writeVaultJson(app, path, value) {
    if (!app || !app.vault) throw new Error("Vault access is not available.");
    const text = `${JSON.stringify(value, null, 2)}\n`;
    const folderPath = path.split("/").slice(0, -1).join("/");
    await ensureFolder(app, folderPath);
    const file = app.vault.getAbstractFileByPath(path);
    if (file) {
      await app.vault.modify(file, text);
    } else {
      await app.vault.create(path, text);
    }
  }

  async function readVaultJson(app, path) {
    if (!app || !app.vault || !app.vault.getAbstractFileByPath) return null;
    const file = app.vault.getAbstractFileByPath(path);
    if (!file) return null;
    try {
      const text = await app.vault.read(file);
      return JSON.parse(text);
    } catch (_e) {
      return null;
    }
  }

  async function saveDailyCache(app, date, pkg, result) {
    const dir = getBaseDir(date);
    await writeVaultJson(app, `${dir}/morning-package-${date}.json`, pkg);
    await writeVaultJson(app, `${dir}/morning-result-${date}.json`, result);
  }

  async function getDailyCache(app, date) {
    const dir = getBaseDir(date);
    const pkg = await readVaultJson(app, `${dir}/morning-package-${date}.json`);
    const result = await readVaultJson(app, `${dir}/morning-result-${date}.json`);
    if (pkg && result) {
      return { pkg, result };
    }
    return null;
  }

  async function saveApprovedFocus(app, date, focusList, isEditedByHuman) {
    const dir = getBaseDir(date);
    const data = {
      date,
      approved_at: new Date().toISOString(),
      focus: focusList,
      edited_by_human: !!isEditedByHuman
    };
    await writeVaultJson(app, `${dir}/approved-focus-${date}.json`, data);
    return data;
  }

  function normalizeApprovedFocus(value) {
    if (!value || !Array.isArray(value.focus) || value.focus.length === 0) return null;
    return value;
  }

  async function getApprovedFocus(app, date) {
    const dir = getBaseDir(date);
    return normalizeApprovedFocus(await readVaultJson(app, `${dir}/approved-focus-${date}.json`));
  }

  async function clearApprovedFocus(app, date) {
    const path = `${getBaseDir(date)}/approved-focus-${date}.json`;
    const file = app && app.vault && app.vault.getAbstractFileByPath(path);
    if (!file) return;
    if (typeof app.vault.delete === "function") {
      await app.vault.delete(file, true);
      return;
    }
    if (app.vault.adapter && typeof app.vault.adapter.remove === "function") {
      await app.vault.adapter.remove(path);
    }
  }

  async function savePinnedFocus(app, date, focusItem) {
    if (!focusItem || !focusItem.id) throw new Error("Pinned focus requires an id.");
    const dir = getBaseDir(date);
    const data = {
      date,
      pinned_at: new Date().toISOString(),
      focus: {
        id: focusItem.id,
        label: focusItem.label || "",
        reason: focusItem.reason || "사용자가 고정한 오늘의 Focus입니다.",
        object_path: focusItem.object_path || "",
        source_type: focusItem.source_type || "health",
        urgency: focusItem.urgency || "high",
        next_action: focusItem.next_action || "",
        pinned: true
      }
    };
    await writeVaultJson(app, `${dir}/pinned-focus-${date}.json`, data);
    return data;
  }

  async function getPinnedFocus(app, date) {
    const dir = getBaseDir(date);
    const data = await readVaultJson(app, `${dir}/pinned-focus-${date}.json`);
    if (!data || !data.focus || !data.focus.id) return null;
    return data;
  }

  async function clearPinnedFocus(app, date) {
    const path = `${getBaseDir(date)}/pinned-focus-${date}.json`;
    const file = app && app.vault && app.vault.getAbstractFileByPath(path);
    if (!file) return;
    if (typeof app.vault.delete === "function") {
      await app.vault.delete(file, true);
      return;
    }
    if (app.vault.adapter && typeof app.vault.adapter.remove === "function") {
      await app.vault.adapter.remove(path);
    }
  }

  function checkIsStale(cachedPkg, newPkg) {
    if (!cachedPkg || !newPkg) return false;
    
    // 1. Compare Todoist counts
    const cTodo = cachedPkg.context.todoist || {};
    const nTodo = newPkg.context.todoist || {};
    if (cTodo.todayCount !== nTodo.todayCount || cTodo.overdueCount !== nTodo.overdueCount) {
      return true;
    }

    // 2. Compare Projects counts and statuses
    const cProj = cachedPkg.context.projects || [];
    const nProj = newPkg.context.projects || [];
    if (cProj.length !== nProj.length) return true;
    for (let i = 0; i < cProj.length; i++) {
      const cp = cProj[i];
      const np = nProj.find(p => p.path === cp.path);
      if (!np) return true;
      if (cp.status !== np.status || cp.due_date !== np.due_date || cp.workflow_summary !== np.workflow_summary) {
        return true;
      }
    }

    // 3. Compare Auctions counts and statuses
    const cAuc = cachedPkg.context.auctions || [];
    const nAuc = newPkg.context.auctions || [];
    if (cAuc.length !== nAuc.length) return true;
    for (let i = 0; i < cAuc.length; i++) {
      const ca = cAuc[i];
      const na = nAuc.find(a => a.path === ca.path);
      if (!na) return true;
      if (ca.status !== na.status || ca.auction_datetime !== na.auction_datetime) {
        return true;
      }
    }

    return false;
  }

  const api = {
    saveDailyCache,
    getDailyCache,
    saveApprovedFocus,
    getApprovedFocus,
    clearApprovedFocus,
    savePinnedFocus,
    getPinnedFocus,
    clearPinnedFocus,
    normalizeApprovedFocus,
    checkIsStale
  };

  root.MorningCache = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
