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
    if (guard.fingerprint !== initialSnapshot.fingerprint) {
      const scrollOwner = guard.shellElement.querySelector(".prodigy-app-shell-body");
      const savedScrollTop = scrollOwner ? scrollOwner.scrollTop : 0;
      // setData refreshes rows in place; a full repaint would reset the scroll
      // offset and the caret even though the user never left the workspace.
      if (typeof guard.workspaceApi.setData === "function") {
        guard.workspaceApi.setData(initialSnapshot.rawPeople, initialSnapshot.sourcePages);
        guard.fingerprint = initialSnapshot.fingerprint;
      } else {
        await guard.paintPeople({ force: true, snapshot: initialSnapshot });
        if (typeof guard.paintPlaces === "function") guard.paintPlaces();
      }
      if (scrollOwner && savedScrollTop) scrollOwner.scrollTop = savedScrollTop;
    }
    return;
  }

  rootEl.empty();
  const shell = window.ProdigyWorkspaceNavigation.mount(rootEl, { app, workspaceId: "personal", title: "개인" });
  const workspaceBody = shell.body;

  // Personal workspace tabs: People / Places
  const ensurePersonalTabStyles = () => {
    const doc = typeof document !== "undefined" ? document : null;
    if (!doc || doc.getElementById("personal-tabs-styles")) return;
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
    const bar = workspaceBody.createDiv({ attr: { role: "tablist", class: "personal-tablist", "aria-label": "개인 워크스페이스" } });
    const buttons = {};
    const panels = {};
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
        buttons[tab.id].setAttr("aria-selected", String(selected));
        if (selected) panels[tab.id].removeAttribute("hidden");
        else panels[tab.id].setAttribute("hidden", "");
      });
    }
    select("people");
    return { getPanel: (id) => panels[id] || null, select };
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
      paintPlaces
    });
    if (workspaceApi && workspaceApi.getState) {
      window.PeopleCore.writeWorkspaceState(window.sessionStorage, workspaceApi.getState());
    }
  };

  const paintPlaces = () => {
    if (window.PeopleView && window.PeopleView.ensureWorkspaceStyles) {
      window.PeopleView.ensureWorkspaceStyles();
    }
    placesMount.empty();
    placesMount.addClass("prodigy-people-workspace");

    const places = dv.pages('"PARA/RESOURCES/Venues"')
      .where(p => p.type === "venue")
      .sort(p => p.file.name, "asc")
      .array()
      .map(p => {
        // Venue `connections`는 배열 규약([wikilink, ...]). 사람과 동일한
        // pageToSource/collectSourcePages 패턴으로 저널 역링크를 읽는다.
        let conns = p.connections;
        if (conns && typeof conns === "object" && !Array.isArray(conns)) {
          try { conns = Array.from(conns); } catch (_e) { conns = String(conns); }
        }
        let journalLinks = [];
        try {
          if (p.file && p.file.outlinks) {
            journalLinks = Array.from(p.file.outlinks)
              .map((l) => (l && l.path) || String(l || ""))
              .filter((l) => /^DAILY\/DAILY\//.test(l));
          }
        } catch (_e) { journalLinks = []; }
        return {
          title: p.file.name,
          path: p.file.path,
          meta: p.venue_category ? [String(p.venue_category)] : [],
          detail: p.address || "",
          connections: Array.isArray(conns) ? conns.map(String) : [],
          journalLinks,
          actions: []
        };
      });

    if (window.VenueView && window.VenueView.renderVenuesWorkspace) {
      window.VenueView.renderVenuesWorkspace({
        app,
        container: placesMount,
        items: places,
        title: "장소",
        onRefresh: () => paintPlaces()
      });
    } else if (window.ProdigyListWorkspace) {
      window.ProdigyListWorkspace.render({
        app,
        container: placesMount,
        title: "장소",
        subtitle: "반복 방문하는 장소의 현장 지식을 보존·관리합니다. 이름을 클릭하면 상세를 엽니다.",
        actions: [],
        sections: [
          {
            title: "장소",
            items: places,
            empty: "등록된 장소가 없습니다. 위의 '장소 추가'로 추가하세요."
          }
        ]
      });
      const h1 = placesMount.querySelector("h1");
      if (h1 && !String(h1.textContent || "").trim()) h1.style.display = "none";
    } else {
      placesMount.createEl("p", { text: "등록된 장소가 없습니다.", attr: { class: "ppw-empty" } });
    }
  };

  await paintPeople({ snapshot: initialSnapshot });
  paintPlaces();
} catch (error) {
  if (window.ProdigyWorkspaceNavigation && window.ProdigyWorkspaceNavigation.renderLoaderError) {
    window.ProdigyWorkspaceNavigation.renderLoaderError(this.container, error, { title: "개인" });
  } else {
    this.container.empty();
    this.container.createEl("p", { text: "개인 워크스페이스를 불러오지 못했습니다.", attr: { role: "alert" } });
  }
}
```
