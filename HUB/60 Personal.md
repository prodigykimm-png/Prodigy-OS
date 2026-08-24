---
cssclasses:
  - prodigy-hub-note
  - hide-properties_editing
  - hide-properties_reading
---
```dataviewjs
window.app = app;
window.obsidian = obsidian;
window.__prodigyMeasurementEntry = window.__prodigyMeasurementEntry && window.__prodigyMeasurementEntry.workspaceId === "personal"
  ? window.__prodigyMeasurementEntry
  : { workspaceId: "personal" };
const loadWorkspaceBootstrap = async (path) => {
  const file = app.vault.getAbstractFileByPath(path);
  if (!file) throw new Error(`워크스페이스 부트스트랩 파일이 없습니다: ${path}`);
  (new Function(await app.vault.read(file)))();
};

let personalPerformance = null;
let personalShell = null;
let personalDataScanToken = null;
let personalProjectionToken = null;
let personalDomRenderToken = null;
let personalPlacesReadyMarked = false;
const personalMeasurementClosed = { data_scan: false, projection: false, dom_render: false };
const endPersonalMeasurement = (phase, token, fields) => {
  if (!personalPerformance || !token || personalMeasurementClosed[phase]) return;
  personalPerformance.end(token, fields);
  personalMeasurementClosed[phase] = true;
};
try {
  if (!window.ProdigyWorkspaceManifest) await loadWorkspaceBootstrap("SYSTEM/Views/prodigy-workspace-manifest.js");
  if (!window.ProdigyHubLoader) await loadWorkspaceBootstrap("SYSTEM/Views/prodigy-hub-loader.js");
  const manifest = window.ProdigyWorkspaceManifest.get("personal");
  await window.ProdigyHubLoader.mountWorkspace(app, manifest, {
    container: this.container,
    renderers: { personal: async (mountContext) => {

  const rootEl = this.container;
  const reportPersonalControllers = typeof this.onPersonalControllersMounted === "function"
    ? this.onPersonalControllersMounted
    : null;
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
      let sourceObjects = p.source_objects;
      if (sourceObjects && !Array.isArray(sourceObjects)) sourceObjects = [sourceObjects];
      if (Array.isArray(sourceObjects)) outlinks.push(...sourceObjects);
      if (p.promoted_knowledge) outlinks.push(p.promoted_knowledge);
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
      dv.pages('"PARA/PROJECTS/Reading"'),
      dv.pages('"ZETA/PERMANENT"'),
      dv.pages('"ZETA/LITERATURE"'),
      dv.pages('"PARA/RESOURCES/Knowledge/Candidates"')
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
  const measurementModule = window.ProdigyWorkspaceMeasurement;
  personalPerformance = measurementModule && typeof measurementModule.getOrCreateSession === "function"
    ? measurementModule.getOrCreateSession({ workspace_id: "personal" })
    : null;
  personalDataScanToken = personalPerformance && personalPerformance.start("data_scan", { scope: "personal", status: "scanning" });

  const initialSnapshot = await collectWorkspaceSnapshot();
  endPersonalMeasurement("data_scan", personalDataScanToken, { scope: "personal", status: "loaded" });
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
  personalShell = window.ProdigyWorkspaceNavigation.mount(rootEl, { app, workspaceId: "personal", title: "개인", mountScope: mountContext.scope });
  personalPerformance = personalPerformance || personalShell.performance;
  const workspaceBody = personalShell.body;

  // Personal workspace tabs: People / Places
  const personalTabStateKey = "prodigy.personal.workspace-tab.v1";
  const validPersonalTab = (value) => value === "people" || value === "places";
  const readPersonalTab = () => {
    const storage = typeof window !== "undefined" ? window.sessionStorage : null;
    if (!storage || typeof storage.getItem !== "function") return "";
    try {
      const value = String(storage.getItem(personalTabStateKey) || "");
      return validPersonalTab(value) ? value : "";
    } catch (_error) {
      return "";
    }
  };
  const writePersonalTab = (value) => {
    if (!validPersonalTab(value)) return false;
    const storage = typeof window !== "undefined" ? window.sessionStorage : null;
    if (!storage || typeof storage.setItem !== "function") return false;
    try {
      storage.setItem(personalTabStateKey, value);
      return true;
    } catch (_error) {
      return false;
    }
  };
  const initialPersonalTab = validPersonalTab(guard && guard.activeTab)
    ? guard.activeTab
    : (readPersonalTab() || "people");
  writePersonalTab(initialPersonalTab);
  const personalTabHost = workspaceBody.createDiv({ attr: { class: "personal-tabs" } });
  const personalPanels = {
    people: workspaceBody.createDiv({ attr: { class: "personal-tabpanel" } }),
    places: workspaceBody.createDiv({ attr: { class: "personal-tabpanel" } })
  };
  let handlePersonalTabChange = () => {};
  const adaptiveControls = window.ProdigyAdaptiveControls;
  if (!adaptiveControls || typeof adaptiveControls.AdaptiveTabs !== "function") {
    throw new Error("개인 워크스페이스 반응형 탭을 불러오지 못했습니다.");
  }
  const adaptivePersonalTabs = adaptiveControls.AdaptiveTabs(personalTabHost, {
    label: "개인 워크스페이스",
    activeId: initialPersonalTab,
    tabs: [
      { id: "people", label: "사람", panel: personalPanels.people },
      { id: "places", label: "장소", panel: personalPanels.places }
    ],
    onChange: (tabId) => handlePersonalTabChange(tabId)
  });
  const personalTabs = {
    getPanel: (id) => personalPanels[id] || null,
    select: (id) => adaptivePersonalTabs.select(id, true),
    getActiveTab: () => adaptivePersonalTabs.getActiveTab()
  };
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
    if (!personalProjectionToken && personalPerformance && !personalMeasurementClosed.projection) {
      personalProjectionToken = personalPerformance.start("projection", { scope: "personal", status: "projecting" });
    }

    // Dataview can replace this code-block container after an index change.
    // Persisted state survives that replacement when the old DOM cannot be reused.
    const persisted = window.PeopleCore.readWorkspaceState(window.sessionStorage);
    const priorWorkspaceApi = workspaceApi;
    const live = priorWorkspaceApi && priorWorkspaceApi.getState ? priorWorkspaceApi.getState() : null;
    const st = live || persisted;
    const model = window.PeopleCore.buildPeopleWorkspaceModel(rawPeople, sourcePages, {
      query: st && st.query ? st.query : "",
      filter: st && st.filter ? st.filter : "all",
      sort: st && st.sort ? st.sort : "name_asc",
      maxPreview: 3
    });
    endPersonalMeasurement("projection", personalProjectionToken, { scope: "personal", status: "projected" });
    if (!personalDomRenderToken && personalPerformance && !personalMeasurementClosed.dom_render) {
      personalDomRenderToken = personalPerformance.start("dom_render", { scope: "personal", status: "rendering" });
    }
    if (priorWorkspaceApi) {
      const disposePriorWorkspace = priorWorkspaceApi.destroy || priorWorkspaceApi.dispose || priorWorkspaceApi.cleanup;
      if (typeof disposePriorWorkspace === "function") disposePriorWorkspace.call(priorWorkspaceApi);
      if (workspaceApi === priorWorkspaceApi) workspaceApi = null;
    }
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
    endPersonalMeasurement("dom_render", personalDomRenderToken, { scope: "personal", status: "rendered" });
    guardStore.set(personalHost, {
      rootEl,
      shellElement: personalShell.element,
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
  const markPlacesReady = () => {
    if (personalPlacesReadyMarked || !personalPerformance || typeof personalPerformance.markReady !== "function") return;
    if (!personalShell || typeof personalShell.readinessSnapshot !== "function") return;
    const snapshot = personalShell.readinessSnapshot("personal.places", {
      status: "deterministic",
      settled: true,
      enabledAction: { id: "personal.places.open", enabled: true },
      activated: true
    });
    const result = personalPerformance.markReady("personal.places", snapshot, { activated: true });
    if (result && result.ready === true) personalPlacesReadyMarked = true;
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
    const activation = Boolean(options && options.activation);
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
    if (!force && venueWorkspaceApi && fingerprint === venueDataFingerprint) {
      if (activation) markPlacesReady();
      return venueWorkspaceApi.getModel ? venueWorkspaceApi.getModel() : null;
    }

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
        if (reportPersonalControllers) reportPersonalControllers(Object.freeze({
          people: workspaceApi,
          places: venueWorkspaceApi
        }));
      }
      venueDataFingerprint = fingerprint;
      if (activation) markPlacesReady();
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
    if (activation) markPlacesReady();
    return null;
  };
  handlePersonalTabChange = (tabId) => {
    writePersonalTab(tabId);
    const activeGuard = guardStore.get(personalHost);
    if (activeGuard) activeGuard.activeTab = tabId;
    if (tabId !== "places") return;
    placesLoaded = true;
    void paintPlaces({ activation: true }).catch(() => {
      if (personalPanels.places && typeof personalPanels.places.empty === "function" && typeof personalPanels.places.createEl === "function") {
        personalPanels.places.empty();
        personalPanels.places.createEl("p", {
          text: "장소를 불러오지 못했습니다.",
          attr: { class: "ppw-empty", role: "alert" }
        });
      }
    });
  };

  await paintPeople({ snapshot: initialSnapshot });
  const peopleSnapshot = personalShell && typeof personalShell.readinessSnapshot === "function"
    ? personalShell.readinessSnapshot("personal.people", {
        status: "deterministic",
        settled: true,
        enabledAction: { id: "personal.people.open", enabled: true }
      })
    : null;
  if (personalPerformance && peopleSnapshot) personalPerformance.markReady("personal.people", peopleSnapshot);
  if (personalTabs.getActiveTab() === "places") await paintPlaces();
  mountContext.scope.track(() => {
    const activeGuard = guardStore.get(personalHost);
    if (activeGuard && activeGuard.shellElement === personalShell.element) guardStore.delete(personalHost);
    [workspaceApi, venueWorkspaceApi, adaptivePersonalTabs].forEach((resource) => {
      if (!resource) return;
      const dispose = resource.dispose || resource.cleanup || resource.destroy;
      if (typeof dispose === "function") dispose.call(resource);
    });
  });
    } }
  });
} catch (error) {
  if (window.ProdigyHubLoader && typeof window.ProdigyHubLoader.preserveRequiredRecovery === "function" && window.ProdigyHubLoader.preserveRequiredRecovery(error, this.container)) return;
  endPersonalMeasurement("data_scan", personalDataScanToken, { scope: "personal", status: "failed" });
  endPersonalMeasurement("projection", personalProjectionToken, { scope: "personal", status: "failed" });
  endPersonalMeasurement("dom_render", personalDomRenderToken, { scope: "personal", status: "failed" });
  if (personalPerformance && typeof personalPerformance.fail === "function") {
    personalPerformance.fail(error, { phase: "error", scope: "personal" });
  }
  if (window.ProdigyWorkspaceNavigation && window.ProdigyWorkspaceNavigation.renderLoaderError) {
    window.ProdigyWorkspaceNavigation.renderLoaderError(this.container, error, { title: "개인" });
  } else {
    this.container.empty();
    this.container.createEl("p", { text: "개인 워크스페이스를 불러오지 못했습니다.", attr: { role: "alert" } });
  }
}
```
