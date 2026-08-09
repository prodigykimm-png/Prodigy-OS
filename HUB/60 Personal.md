---
cssclasses:
  - hide-properties_editing
  - hide-properties_reading
---
```dataviewjs
window.app = app;
window.obsidian = obsidian;

const loadProdigyScript = async (path) => {
  const tFile = app.vault.getAbstractFileByPath(path);
  if (!tFile) throw new Error(`Missing script: ${path}`);
  (new Function(await app.vault.read(tFile)))();
};

try {
  await loadProdigyScript("SYSTEM/Views/design-tokens.js");
  await loadProdigyScript("SYSTEM/Views/workspace-registry.js");
  await loadProdigyScript("SYSTEM/Views/prodigy-workspace-state-store.js");
  await loadProdigyScript("SYSTEM/Views/prodigy-app-shell.js");
  await loadProdigyScript("SYSTEM/Views/workspace-navigation.js");
  await loadProdigyScript("SYSTEM/Views/display-registry.js");
  await loadProdigyScript("SYSTEM/Views/prodigy-ui.js");
  await loadProdigyScript("SYSTEM/Views/workspace-list-view.js");
  await loadProdigyScript("SYSTEM/Views/people-core.js");
  await loadProdigyScript("SYSTEM/Views/people-store.js");
  await loadProdigyScript("SYSTEM/Views/people-styles.js");
  await loadProdigyScript("SYSTEM/Views/people-view.js");
  await loadProdigyScript("SYSTEM/Views/venue-store.js");
  await loadProdigyScript("SYSTEM/Views/venue-view.js");
  await loadProdigyScript("SYSTEM/Views/venue-creator.js");

  const rootEl = this.container;
  const personalHost = typeof rootEl.closest === "function"
    ? (rootEl.closest(".workspace-leaf-content") || rootEl.closest(".markdown-reading-view") || rootEl.parentElement || rootEl)
    : (rootEl.parentElement || rootEl);

  const pageToSource = (p) => {
    if (!p || !p.file) return null;
    let outlinks = [];
    try {
      if (p.file.outlinks) {
        outlinks = Array.from(p.file.outlinks).map((l) => {
          if (!l) return "";
          if (typeof l === "string") return l;
          return l.path || String(l);
        }).filter(Boolean);
      }
    } catch (_e) {
      outlinks = [];
    }
    let connections = p.connections;
    if (connections && typeof connections === "object" && !Array.isArray(connections)) {
      try { connections = Array.from(connections); } catch (_e2) { connections = String(connections); }
    }
    return {
      path: p.file.path,
      type: p.type || "",
      title: p.file.name || p.title || "",
      connections,
      outlinks,
      body: "",
      updated: p.date || p.updated || p.file.day || ""
    };
  };

  const readNoteText = async (filePath) => {
    const path = String(filePath || "");
    if (!path) return "";
    // 1) Dataview io (most reliable inside dataviewjs)
    try {
      if (dv && dv.io && typeof dv.io.load === "function") {
        const text = await dv.io.load(path);
        if (text != null && String(text).length) return String(text);
      }
    } catch (_e0) { /* fall through */ }
    // 2) Vault via path → TFile (Dataview p.file is NOT a TFile)
    try {
      if (app.vault && typeof app.vault.getAbstractFileByPath === "function") {
        const af = app.vault.getAbstractFileByPath(path);
        if (af) {
          if (typeof app.vault.cachedRead === "function") return await app.vault.cachedRead(af);
          if (typeof app.vault.read === "function") return await app.vault.read(af);
        }
      }
    } catch (_e1) { /* fall through */ }
    return "";
  };

  const collectRawPeople = async () => {
    // Primary: vault.getFiles() — always current, no Dataview cache delay
    const allFiles = (app.vault.getFiles && app.vault.getFiles()) || [];
    const contactFiles = allFiles.filter(
      (f) => f.path.startsWith("PARA/RESOURCES/CONTACTS/") && f.extension === "md"
    );

    // Supplement: Dataview metadata (faster for frontmatter when available)
    let dvMap = new Map();
    try {
      const dvPages = dv.pages('"PARA/RESOURCES/CONTACTS"').array();
      dvPages.forEach((p) => {
        if (p && p.file && p.file.path) dvMap.set(p.file.path, p);
      });
    } catch (_e) { /* ignore */ }

    const out = [];
    for (const file of contactFiles) {
      const path = file.path;
      const p = dvMap.get(path);
      const body = await readNoteText(path);
      out.push({
        path,
        type: (p && p.type) || "people",
        name: (p && p.file && p.file.name) || file.basename || file.name.replace(/\.md$/i, ""),
        title: (p && p.title) || "",
        relationship: (p && p.relationship) || "",
        company: (p && p.company) || "",
        role: (p && p.role) || "",
        last_contact: (p && p.last_contact) || "",
        body
      });
    }
    return out;
  };

  const collectSourcePages = () => {
    // One scan of link-capable domains (not full vault × people)
    const buckets = [
      dv.pages('"PARA/PROJECTS"'),
      dv.pages('"DAILY/DAILY"'),
      dv.pages('"PARA/PROJECTS/Reading"')
    ];
    const out = [];
    const seen = Object.create(null);
    buckets.forEach((pages) => {
      (pages.array ? pages.array() : []).forEach((p) => {
        const item = pageToSource(p);
        if (!item || !item.path || seen[item.path]) return;
        // Skip People notes as sources of "linked context" for themselves
        if (String(item.path).indexOf("PARA/RESOURCES/CONTACTS/") === 0) return;
        seen[item.path] = true;
        out.push(item);
      });
    });
    return out;
  };

  const workspaceFingerprint = (rawPeople, sourcePages) => {
    const people = window.PeopleCore.peopleFingerprint(rawPeople);
    const sources = (sourcePages || []).map((item) => [
      item.path || "",
      item.type || "",
      item.title || "",
      Array.isArray(item.connections) ? item.connections.map(String).sort().join("\u001c") : String(item.connections || ""),
      Array.isArray(item.outlinks) ? item.outlinks.map(String).sort().join("\u001c") : "",
      String(item.updated || "")
    ].join("\u001f")).sort();
    return `${people}\u001d${sources.join("\u001e")}`;
  };

  const collectWorkspaceSnapshot = async () => {
    const rawPeople = await collectRawPeople();
    const sourcePages = collectSourcePages();
    return {
      rawPeople,
      sourcePages,
      fingerprint: workspaceFingerprint(rawPeople, sourcePages)
    };
  };

  const initialSnapshot = await collectWorkspaceSnapshot();
  const guardStore = window.__prodigyPersonalRenderGuard instanceof WeakMap
    ? window.__prodigyPersonalRenderGuard
    : new WeakMap();
  window.__prodigyPersonalRenderGuard = guardStore;
  const guard = guardStore.get(personalHost);
  const canReuseWorkspace = Boolean(
    guard
    && guard.shellElement
    && guard.workspaceApi
    && typeof guard.paintPeople === "function"
  );

  if (canReuseWorkspace) {
    if (guard.shellElement.parentElement !== rootEl) {
      rootEl.empty();
      rootEl.appendChild(guard.shellElement);
    }
    const scrollOwner = guard.shellElement.querySelector(".prodigy-app-shell-body");
    const savedScrollTop = scrollOwner ? scrollOwner.scrollTop : 0;
    // setData refreshes rows in place; a full repaint would reset the scroll
    // offset and the caret even though the user never left the workspace.
    if (guard.fingerprint !== initialSnapshot.fingerprint) {
      if (typeof guard.workspaceApi.setData === "function") {
        guard.workspaceApi.setData(initialSnapshot.rawPeople, initialSnapshot.sourcePages);
        guard.fingerprint = initialSnapshot.fingerprint;
      } else {
        await guard.paintPeople({ force: true, snapshot: initialSnapshot });
      }
    }
    // Place data is intentionally lazy: the default People tab must not scan
    // every Venue body and every Daily page before the workspace is usable.
    if (guard.activeTab === "places" && guard.placesLoaded && typeof guard.paintPlaces === "function") {
      await guard.paintPlaces({ force: true });
    }
    if (scrollOwner && savedScrollTop) scrollOwner.scrollTop = savedScrollTop;
    return;
  }

  rootEl.empty();
  const shell = window.ProdigyWorkspaceNavigation.mount(rootEl, { app, workspaceId: "personal", title: "개인" });
  const workspaceBody = shell.body;

  // Personal workspace tabs: People / Places
  const ensurePersonalTabStyles = () => {
    const doc = typeof document !== "undefined" ? document : null;
    if (!doc || typeof doc.getElementById !== "function" || typeof doc.createElement !== "function" || !doc.head || typeof doc.head.appendChild !== "function" || doc.getElementById("personal-tabs-styles")) return;
    const style = doc.createElement("style");
    style.id = "personal-tabs-styles";
    style.textContent = [
      ".personal-tablist{display:flex;gap:6px;margin:0 0 12px;border-bottom:1px solid var(--background-modifier-border);padding:0}",
      ".personal-tab{min-height:36px;padding:6px 16px;border:none;border-bottom:2px solid transparent;background:none;color:var(--text-muted);font-weight:700;font-size:.88em;cursor:pointer}",
      ".personal-tab:hover{color:var(--text-normal)}",
      ".personal-tab[aria-selected=\"true\"]{color:var(--text-normal);border-bottom-color:var(--text-accent)}",
      "@media(max-width:600px){.personal-tablist{flex-direction:column}.personal-tab{width:100%;min-height:44px}}"
    ].join("\n");
    doc.head.appendChild(style);
  };
  ensurePersonalTabStyles();

  const personalTabs = (() => {
    const tabs = Object.freeze([
      Object.freeze({ id: "people", label: "사람" }),
      Object.freeze({ id: "places", label: "장소" })
    ]);
    let active = "people";
    let onSelect = () => {};
    const bar = workspaceBody.createDiv({ attr: { role: "tablist", class: "personal-tablist", "aria-label": "개인 워크스페이스" } });
    const buttons = {};
    const panels = {};
    const setTabAttribute = (element, name, value) => {
      if (!element) return;
      if (typeof element.setAttr === "function") element.setAttr(name, value);
      else if (typeof element.setAttribute === "function") element.setAttribute(name, value);
      else {
        element.attr = element.attr || {};
        element.attr[name] = value;
      }
    };
    const setTabVisible = (element, visible) => {
      if (!element) return;
      if (visible) {
        if (typeof element.removeAttribute === "function") element.removeAttribute("hidden");
        else if (element.attr) delete element.attr.hidden;
        element.hidden = false;
      } else {
        setTabAttribute(element, "hidden", "");
        element.hidden = true;
      }
    };
    tabs.forEach((tab) => {
      const btn = bar.createEl("button", {
        text: tab.label,
        attr: { type: "button", role: "tab", "aria-selected": String(tab.id === active), class: "personal-tab" }
      });
      btn.onclick = () => select(tab.id);
      buttons[tab.id] = btn;
      panels[tab.id] = workspaceBody.createDiv({ attr: { role: "tabpanel", class: "personal-tabpanel" } });
    });
    function select(id) {
      if (!panels[id]) return;
      active = id;
      tabs.forEach((tab) => {
        const selected = tab.id === active;
        setTabAttribute(buttons[tab.id], "aria-selected", String(selected));
        setTabVisible(panels[tab.id], selected);
      });
      onSelect(active);
    }
    select("people");
    return {
      getPanel: (id) => panels[id] || null,
      select,
      getActiveTab: () => active,
      setOnSelect: (next) => { onSelect = typeof next === "function" ? next : () => {}; }
    };
  })();

  const peopleMount = personalTabs.getPanel("people");
  const placesMount = personalTabs.getPanel("places");

  let workspaceApi = null;

  const paintPeople = async (options) => {
    const force = Boolean(options && options.force);
    const snapshot = options && options.snapshot
      ? options.snapshot
      : await collectWorkspaceSnapshot();
    const rawPeople = snapshot.rawPeople;
    const sourcePages = snapshot.sourcePages;

    // Dataview reruns this block after an actual index change. Repainting when
    // the data is equivalent would still destroy focus, scroll, and typing.
    const fingerprint = snapshot.fingerprint;
    const activeGuard = guardStore.get(personalHost);
    const shouldSkipRepaint = Boolean(
      !force
      && activeGuard
      && activeGuard.mount === peopleMount
      && activeGuard.fingerprint === fingerprint
      && workspaceApi
    );
    if (shouldSkipRepaint) return;

    // Dataview can replace this code-block container after an index change.
    // Persisted state survives that replacement when the old DOM cannot be reused.
    const persisted = window.PeopleCore.readWorkspaceState(window.sessionStorage);
    const live = workspaceApi && workspaceApi.getState ? workspaceApi.getState() : null;
    const st = live || persisted;
    const model = window.PeopleCore.buildPeopleWorkspaceModel(rawPeople, sourcePages, {
      query: st && st.query ? st.query : "",
      filter: st && st.filter ? st.filter : "all",
      sort: st && st.sort ? st.sort : "name_asc",
      maxPreview: 3
    });
    peopleMount.empty();
    workspaceApi = window.PeopleView.renderPeopleWorkspace({
      app,
      container: peopleMount,
      model,
      rawPeople,
      sourcePages,
      selectedPath: st && st.selectedPath ? st.selectedPath : "",
      title: "사람과 관계",
      subtitle: "이름 클릭 = 관계 맥락 · 관계 편집과 원본 노트는 상세에서 · 최근 맥락은 연결된 원본 기록입니다.",
      onRefresh: () => paintPeople({ force: true }),
      onStateChange: (next) => window.PeopleCore.writeWorkspaceState(window.sessionStorage, next)
    });
    guardStore.set(personalHost, {
      rootEl,
      shellElement: shell.element,
      mount: peopleMount,
      workspaceApi,
      fingerprint,
      paintPeople,
      activeTab: personalTabs.getActiveTab(),
      placesLoaded: false,
      paintPlaces
    });
    if (workspaceApi && workspaceApi.getState) {
      window.PeopleCore.writeWorkspaceState(window.sessionStorage, workspaceApi.getState());
    }
  };

  let venueWorkspaceApi = null;
  let venueDataFingerprint = "";
  let venuePaintSerial = 0;
  let placesLoaded = false;

  const toArray = (value) => {
    if (Array.isArray(value)) return value.slice();
    if (value == null || typeof value === "string") return value == null ? [] : [value];
    try { return Array.from(value); } catch (_e) { return [value]; }
  };

  const dateValue = (value) => {
    if (value == null || value === "") return "";
    if (typeof value === "number") return value;
    try {
      if (typeof value.toISO === "function") return String(value.toISO());
      if (typeof value.toMillis === "function") return String(new Date(value.toMillis()).toISOString());
    } catch (_e) { /* keep string fallback */ }
    return String(value);
  };

  const referenceKey = (value) => String(value == null ? "" : value)
    .replace(/^\[\[/, "")
    .replace(/\]\]$/, "")
    .split("|")[0]
    .split("#")[0]
    .replace(/\.md$/i, "")
    .replace(/\\/g, "/")
    .trim()
    .toLowerCase();

  const journalReferences = (page) => {
    const refs = [];
    toArray(page && page.file && page.file.outlinks).forEach((link) => {
      refs.push(link && typeof link === "object" ? (link.path || link.link || "") : link);
    });
    toArray(page && page.outlinks).forEach((link) => {
      refs.push(link && typeof link === "object" ? (link.path || link.link || "") : link);
    });
    let rawConnections = page && page.connections;
    if (rawConnections && typeof rawConnections === "object" && !Array.isArray(rawConnections)) {
      try { rawConnections = Array.from(rawConnections); } catch (_e) { /* keep original */ }
    }
    const connectionValues = window.VenueStore && window.VenueStore.normalizeConnections
      ? window.VenueStore.normalizeConnections(rawConnections)
      : toArray(rawConnections);
    connectionValues.forEach((link) => {
      refs.push(link && typeof link === "object" ? (link.path || link.link || "") : link);
    });
    return refs.map(referenceKey).filter(Boolean);
  };

  const collectVenueWorkspaceItems = async () => {
    // Both scans are folder-bounded: Venue notes for current body, Daily pages
    // for reverse links. No full-vault file enumeration is needed here.
    const venuePages = dv.pages('"PARA/RESOURCES/Venues"')
      .where(p => p && p.type === "venue")
      .array();
    const dailyPages = dv.pages('"DAILY/DAILY"').array();
    const journalRows = dailyPages.map((page) => ({
      path: page && page.file ? page.file.path : "",
      title: page && page.file ? page.file.name : "",
      refs: journalReferences(page)
    })).filter((row) => row.path && /^DAILY\/DAILY\//.test(row.path));

    const items = [];
    for (const page of venuePages) {
      const path = page && page.file ? page.file.path : "";
      if (!path) continue;
      let body = "";
      try { body = await readNoteText(path); } catch (_e) { body = ""; }
      const title = page.file.name || page.file.basename || path.split("/").pop().replace(/\.md$/i, "");
      let connections = page.connections;
      if (connections && typeof connections === "object" && !Array.isArray(connections)) {
        try { connections = Array.from(connections); } catch (_e2) { connections = String(connections); }
      }
      const normalizedConnections = window.VenueStore && window.VenueStore.normalizeConnections
        ? window.VenueStore.normalizeConnections(connections)
        : toArray(connections).map((value) => String(value || "").trim()).filter(Boolean);
      const venueKeys = [
        referenceKey(path),
        referenceKey(title),
        referenceKey(`[[${title}]]`)
      ].filter(Boolean);
      const journalLinks = journalRows
        .filter((journal) => journal.refs.some((ref) => venueKeys.some((key) => ref === key)))
        .map((journal) => journal.path)
        .sort((a, b) => a.localeCompare(b, "ko"));
      items.push({
        type: "venue",
        title,
        name: title,
        path,
        venue_category: page.venue_category || "",
        address: page.address || "",
        connections: normalizedConnections,
        body,
        updated: dateValue(page.updated || (page.file && page.file.mtime) || ""),
        journalLinks,
        meta: page.venue_category ? [String(page.venue_category)] : [],
        detail: page.address || ""
      });
    }
    items.sort((a, b) => String(a.title).localeCompare(String(b.title), "ko") || a.path.localeCompare(b.path));
    return items;
  };

  const paintPlaces = async (options) => {
    const serial = ++venuePaintSerial;
    const force = Boolean(options && options.force);
    placesLoaded = true;
    const activeGuard = guardStore.get(personalHost);
    if (activeGuard) activeGuard.placesLoaded = true;
    if (!venueWorkspaceApi && placesMount && typeof placesMount.empty === "function" && typeof placesMount.createEl === "function") {
      placesMount.empty();
      placesMount.createEl("p", {
        text: "장소를 불러오는 중…",
        attr: { class: "ppw-empty", role: "status" }
      });
    }
    const places = await collectVenueWorkspaceItems();
    if (serial !== venuePaintSerial) return null;
    const fingerprint = window.VenueStore && typeof window.VenueStore.venueFingerprint === "function"
      ? window.VenueStore.venueFingerprint(places)
      : JSON.stringify(places);
    if (!force && venueWorkspaceApi && fingerprint === venueDataFingerprint) return venueWorkspaceApi.getModel
      ? venueWorkspaceApi.getModel()
      : null;

    if (window.VenueView && window.VenueView.renderVenuesWorkspace) {
      if (venueWorkspaceApi && typeof venueWorkspaceApi.setData === "function") {
        venueWorkspaceApi.setData(places);
      } else {
        venueWorkspaceApi = window.VenueView.renderVenuesWorkspace({
          app,
          container: placesMount,
          items: places,
          title: "장소",
          subtitle: "반복 방문하는 장소의 현장 지식을 보존·관리합니다. 검색·필터·상세에서 맥락을 이어갑니다.",
          onRefresh: () => paintPlaces({ force: true })
        });
      }
      venueDataFingerprint = fingerprint;
      return venueWorkspaceApi && venueWorkspaceApi.getModel ? venueWorkspaceApi.getModel() : null;
    }

    placesMount.empty();
    placesMount.addClass("prodigy-people-workspace");
    if (window.ProdigyListWorkspace) {
      window.ProdigyListWorkspace.render({
        app,
        container: placesMount,
        title: "장소",
        subtitle: "반복 방문하는 장소의 현장 지식을 보존·관리합니다. 이름을 클릭하면 상세를 엽니다.",
        actions: [],
        sections: [{
          title: "장소",
          items: places,
          empty: "등록된 장소가 없습니다. 위의 '장소 추가'로 추가하세요."
        }]
      });
      const h1 = placesMount.querySelector("h1");
      if (h1 && !String(h1.textContent || "").trim()) h1.style.display = "none";
    } else {
      placesMount.createEl("p", { text: "등록된 장소가 없습니다.", attr: { class: "ppw-empty" } });
    }
    venueDataFingerprint = fingerprint;
    return null;
  };
  personalTabs.setOnSelect((tabId) => {
    const activeGuard = guardStore.get(personalHost);
    if (activeGuard) activeGuard.activeTab = tabId;
    if (tabId !== "places") return;
    placesLoaded = true;
    void paintPlaces().catch(() => {
      if (placesMount && typeof placesMount.empty === "function" && typeof placesMount.createEl === "function") {
        placesMount.empty();
        placesMount.createEl("p", {
          text: "장소를 불러오지 못했습니다.",
          attr: { class: "ppw-empty", role: "alert" }
        });
      }
    });
  });

  await paintPeople({ snapshot: initialSnapshot });
} catch (error) {
  if (window.ProdigyWorkspaceNavigation && window.ProdigyWorkspaceNavigation.renderLoaderError) {
    window.ProdigyWorkspaceNavigation.renderLoaderError(this.container, error, { title: "개인" });
  } else {
    this.container.empty();
    this.container.createEl("p", { text: "개인 워크스페이스를 불러오지 못했습니다.", attr: { role: "alert" } });
  }
}
```
