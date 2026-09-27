<!--memoge:html-->
<hr>
<p>cssclasses:</p>
<ul>
<li>prodigy-hub-note</li>
<li>hide-properties_editing</li>
<li>hide-properties_reading</li>
</ul>
<hr>
<pre><code class="language-dataviewjs">window.app = app;
window.obsidian = obsidian;
window.__prodigyMeasurementEntry = window.__prodigyMeasurementEntry &amp;&amp; window.__prodigyMeasurementEntry.workspaceId === &quot;personal&quot;
  ? window.__prodigyMeasurementEntry
  : { workspaceId: &quot;personal&quot; };
const loadWorkspaceBootstrap = async (path) =&gt; {
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
const endPersonalMeasurement = (phase, token, fields) =&gt; {
  if (!personalPerformance || !token || personalMeasurementClosed[phase]) return;
  personalPerformance.end(token, fields);
  personalMeasurementClosed[phase] = true;
};
try {
  if (!window.ProdigyWorkspaceManifest) await loadWorkspaceBootstrap(&quot;SYSTEM/Views/prodigy-workspace-manifest.js&quot;);
  if (!window.ProdigyHubLoader) await loadWorkspaceBootstrap(&quot;SYSTEM/Views/prodigy-hub-loader.js&quot;);
  const manifest = window.ProdigyWorkspaceManifest.get(&quot;personal&quot;);
  await window.ProdigyHubLoader.mountWorkspace(app, manifest, {
    container: this.container,
    renderers: { personal: async (mountContext) =&gt; {

  const rootEl = this.container;
  const reportPersonalControllers = typeof this.onPersonalControllersMounted === &quot;function&quot;
    ? this.onPersonalControllersMounted
    : null;
  const personalHost = typeof rootEl.closest === &quot;function&quot;
    ? (rootEl.closest(&quot;.workspace-leaf-content&quot;) || rootEl.closest(&quot;.markdown-reading-view&quot;) || rootEl.parentElement || rootEl)
    : (rootEl.parentElement || rootEl);

  const pageToSource = (p) =&gt; {
    if (!p || !p.file) return null;
    let outlinks = [];
    try {
      if (p.file.outlinks) {
        outlinks = Array.from(p.file.outlinks).map((l) =&gt; {
          if (!l) return &quot;&quot;;
          if (typeof l === &quot;string&quot;) return l;
          return l.path || String(l);
        }).filter(Boolean);
      }
      let sourceObjects = p.source_objects;
      if (sourceObjects &amp;&amp; !Array.isArray(sourceObjects)) sourceObjects = [sourceObjects];
      if (Array.isArray(sourceObjects)) outlinks.push(...sourceObjects);
      if (p.promoted_knowledge) outlinks.push(p.promoted_knowledge);
    } catch (_e) {
      outlinks = [];
    }
    let connections = p.connections;
    if (connections &amp;&amp; typeof connections === &quot;object&quot; &amp;&amp; !Array.isArray(connections)) {
      try { connections = Array.from(connections); } catch (_e2) { connections = String(connections); }
    }
    return {
      path: p.file.path,
      type: p.type || &quot;&quot;,
      title: p.file.name || p.title || &quot;&quot;,
      connections,
      outlinks,
      body: &quot;&quot;,
      updated: p.date || p.updated || p.file.day || &quot;&quot;
    };
  };

  const readNoteText = async (filePath) =&gt; {
    const path = String(filePath || &quot;&quot;);
    if (!path) return &quot;&quot;;
    // 1) Dataview io (most reliable inside dataviewjs)
    try {
      if (dv &amp;&amp; dv.io &amp;&amp; typeof dv.io.load === &quot;function&quot;) {
        const text = await dv.io.load(path);
        if (text != null &amp;&amp; String(text).length) return String(text);
      }
    } catch (_e0) { /* fall through */ }
    // 2) Vault via path → TFile (Dataview p.file is NOT a TFile)
    try {
      if (app.vault &amp;&amp; typeof app.vault.getAbstractFileByPath === &quot;function&quot;) {
        const af = app.vault.getAbstractFileByPath(path);
        if (af) {
          if (typeof app.vault.cachedRead === &quot;function&quot;) return await app.vault.cachedRead(af);
          if (typeof app.vault.read === &quot;function&quot;) return await app.vault.read(af);
        }
      }
    } catch (_e1) { /* fall through */ }
    return &quot;&quot;;
  };

  const collectRawPeople = async () =&gt; {
    // Primary: vault.getFiles() — always current, no Dataview cache delay
    const allFiles = (app.vault.getFiles &amp;&amp; app.vault.getFiles()) || [];
    const contactFiles = allFiles.filter(
      (f) =&gt; f.path.startsWith(&quot;PARA/RESOURCES/CONTACTS/&quot;) &amp;&amp; f.extension === &quot;md&quot;
    );

    // Supplement: Dataview metadata (faster for frontmatter when available)
    let dvMap = new Map();
    try {
      const dvPages = dv.pages(&#39;&quot;PARA/RESOURCES/CONTACTS&quot;&#39;).array();
      dvPages.forEach((p) =&gt; {
        if (p &amp;&amp; p.file &amp;&amp; p.file.path) dvMap.set(p.file.path, p);
      });
    } catch (_e) { /* ignore */ }

    const out = [];
    for (const file of contactFiles) {
      const path = file.path;
      const p = dvMap.get(path);
      const body = await readNoteText(path);
      out.push({
        path,
        type: (p &amp;&amp; p.type) || &quot;people&quot;,
        name: (p &amp;&amp; p.file &amp;&amp; p.file.name) || file.basename || file.name.replace(/\.md$/i, &quot;&quot;),
        title: (p &amp;&amp; p.title) || &quot;&quot;,
        relationship: (p &amp;&amp; p.relationship) || &quot;&quot;,
        company: (p &amp;&amp; p.company) || &quot;&quot;,
        role: (p &amp;&amp; p.role) || &quot;&quot;,
        last_contact: (p &amp;&amp; p.last_contact) || &quot;&quot;,
        body
      });
    }
    return out;
  };

  const collectSourcePages = () =&gt; {
    // One scan of link-capable domains (not full vault × people)
    const buckets = [
      dv.pages(&#39;&quot;PARA/PROJECTS&quot;&#39;),
      dv.pages(&#39;&quot;DAILY/DAILY&quot;&#39;),
      dv.pages(&#39;&quot;PARA/PROJECTS/Reading&quot;&#39;),
      dv.pages(&#39;&quot;ZETA/PERMANENT&quot;&#39;),
      dv.pages(&#39;&quot;ZETA/LITERATURE&quot;&#39;),
      dv.pages(&#39;&quot;PARA/RESOURCES/Knowledge/Candidates&quot;&#39;)
    ];
    const out = [];
    const seen = Object.create(null);
    buckets.forEach((pages) =&gt; {
      (pages.array ? pages.array() : []).forEach((p) =&gt; {
        const item = pageToSource(p);
        if (!item || !item.path || seen[item.path]) return;
        // Skip People notes as sources of &quot;linked context&quot; for themselves
        if (String(item.path).indexOf(&quot;PARA/RESOURCES/CONTACTS/&quot;) === 0) return;
        seen[item.path] = true;
        out.push(item);
      });
    });
    return out;
  };

  const workspaceFingerprint = (rawPeople, sourcePages) =&gt; {
    const people = window.PeopleCore.peopleFingerprint(rawPeople);
    const sources = (sourcePages || []).map((item) =&gt; [
      item.path || &quot;&quot;,
      item.type || &quot;&quot;,
      item.title || &quot;&quot;,
      Array.isArray(item.connections) ? item.connections.map(String).sort().join(&quot;\u001c&quot;) : String(item.connections || &quot;&quot;),
      Array.isArray(item.outlinks) ? item.outlinks.map(String).sort().join(&quot;\u001c&quot;) : &quot;&quot;,
      String(item.updated || &quot;&quot;)
    ].join(&quot;\u001f&quot;)).sort();
    return `${people}\u001d${sources.join(&quot;\u001e&quot;)}`;
  };

  const collectWorkspaceSnapshot = async () =&gt; {
    const rawPeople = await collectRawPeople();
    const sourcePages = collectSourcePages();
    return {
      rawPeople,
      sourcePages,
      fingerprint: workspaceFingerprint(rawPeople, sourcePages)
    };
  };
  const measurementModule = window.ProdigyWorkspaceMeasurement;
  personalPerformance = measurementModule &amp;&amp; typeof measurementModule.getOrCreateSession === &quot;function&quot;
    ? measurementModule.getOrCreateSession({ workspace_id: &quot;personal&quot; })
    : null;
  personalDataScanToken = personalPerformance &amp;&amp; personalPerformance.start(&quot;data_scan&quot;, { scope: &quot;personal&quot;, status: &quot;scanning&quot; });

  const initialSnapshot = await collectWorkspaceSnapshot();
  endPersonalMeasurement(&quot;data_scan&quot;, personalDataScanToken, { scope: &quot;personal&quot;, status: &quot;loaded&quot; });
  const guardStore = window.__prodigyPersonalRenderGuard instanceof WeakMap
    ? window.__prodigyPersonalRenderGuard
    : new WeakMap();
  window.__prodigyPersonalRenderGuard = guardStore;
  const guard = guardStore.get(personalHost);
  const canReuseWorkspace = Boolean(
    guard
    &amp;&amp; guard.shellElement
    &amp;&amp; guard.workspaceApi
    &amp;&amp; typeof guard.paintPeople === &quot;function&quot;
  );

  if (canReuseWorkspace) {
    if (guard.shellElement.parentElement !== rootEl) {
      rootEl.empty();
      rootEl.appendChild(guard.shellElement);
    }
    const scrollOwner = guard.shellElement.querySelector(&quot;.prodigy-app-shell-body&quot;);
    const savedScrollTop = scrollOwner ? scrollOwner.scrollTop : 0;
    // setData refreshes rows in place; a full repaint would reset the scroll
    // offset and the caret even though the user never left the workspace.
    if (guard.fingerprint !== initialSnapshot.fingerprint) {
      if (typeof guard.workspaceApi.setData === &quot;function&quot;) {
        guard.workspaceApi.setData(initialSnapshot.rawPeople, initialSnapshot.sourcePages);
        guard.fingerprint = initialSnapshot.fingerprint;
      } else {
        await guard.paintPeople({ force: true, snapshot: initialSnapshot });
      }
    }
    // Place data is intentionally lazy: the default People tab must not scan
    // every Venue body and every Daily page before the workspace is usable.
    if (guard.activeTab === &quot;places&quot; &amp;&amp; guard.placesLoaded &amp;&amp; typeof guard.paintPlaces === &quot;function&quot;) {
      await guard.paintPlaces({ force: true });
    }
    if (scrollOwner &amp;&amp; savedScrollTop) scrollOwner.scrollTop = savedScrollTop;
    return;
  }

  rootEl.empty();
  personalShell = window.ProdigyWorkspaceNavigation.mount(rootEl, { app, workspaceId: &quot;personal&quot;, title: &quot;개인&quot;, mountScope: mountContext.scope });
  personalPerformance = personalPerformance || personalShell.performance;
  const workspaceBody = personalShell.body;

  // Personal workspace tabs: People / Places
  const personalTabStateKey = &quot;prodigy.personal.workspace-tab.v1&quot;;
  const validPersonalTab = (value) =&gt; value === &quot;people&quot; || value === &quot;places&quot;;
  const readPersonalTab = () =&gt; {
    const storage = typeof window !== &quot;undefined&quot; ? window.sessionStorage : null;
    if (!storage || typeof storage.getItem !== &quot;function&quot;) return &quot;&quot;;
    try {
      const value = String(storage.getItem(personalTabStateKey) || &quot;&quot;);
      return validPersonalTab(value) ? value : &quot;&quot;;
    } catch (_error) {
      return &quot;&quot;;
    }
  };
  const writePersonalTab = (value) =&gt; {
    if (!validPersonalTab(value)) return false;
    const storage = typeof window !== &quot;undefined&quot; ? window.sessionStorage : null;
    if (!storage || typeof storage.setItem !== &quot;function&quot;) return false;
    try {
      storage.setItem(personalTabStateKey, value);
      return true;
    } catch (_error) {
      return false;
    }
  };
  const initialPersonalTab = validPersonalTab(guard &amp;&amp; guard.activeTab)
    ? guard.activeTab
    : (readPersonalTab() || &quot;people&quot;);
  writePersonalTab(initialPersonalTab);
  const personalTabHost = workspaceBody.createDiv({ attr: { class: &quot;personal-tabs&quot; } });
  const personalPanels = {
    people: workspaceBody.createDiv({ attr: { class: &quot;personal-tabpanel&quot; } }),
    places: workspaceBody.createDiv({ attr: { class: &quot;personal-tabpanel&quot; } })
  };
  let handlePersonalTabChange = () =&gt; {};
  const adaptiveControls = window.ProdigyAdaptiveControls;
  if (!adaptiveControls || typeof adaptiveControls.AdaptiveTabs !== &quot;function&quot;) {
    throw new Error(&quot;개인 워크스페이스 반응형 탭을 불러오지 못했습니다.&quot;);
  }
  const adaptivePersonalTabs = adaptiveControls.AdaptiveTabs(personalTabHost, {
    label: &quot;개인 워크스페이스&quot;,
    activeId: initialPersonalTab,
    tabs: [
      { id: &quot;people&quot;, label: &quot;사람&quot;, panel: personalPanels.people },
      { id: &quot;places&quot;, label: &quot;장소&quot;, panel: personalPanels.places }
    ],
    onChange: (tabId) =&gt; handlePersonalTabChange(tabId)
  });
  const personalTabs = {
    getPanel: (id) =&gt; personalPanels[id] || null,
    select: (id) =&gt; adaptivePersonalTabs.select(id, true),
    getActiveTab: () =&gt; adaptivePersonalTabs.getActiveTab()
  };
  const peopleMount = personalTabs.getPanel(&quot;people&quot;);
  const placesMount = personalTabs.getPanel(&quot;places&quot;);

  let workspaceApi = null;

  const paintPeople = async (options) =&gt; {
    const force = Boolean(options &amp;&amp; options.force);
    const snapshot = options &amp;&amp; options.snapshot
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
      &amp;&amp; activeGuard
      &amp;&amp; activeGuard.mount === peopleMount
      &amp;&amp; activeGuard.fingerprint === fingerprint
      &amp;&amp; workspaceApi
    );
    if (shouldSkipRepaint) return;
    if (!personalProjectionToken &amp;&amp; personalPerformance &amp;&amp; !personalMeasurementClosed.projection) {
      personalProjectionToken = personalPerformance.start(&quot;projection&quot;, { scope: &quot;personal&quot;, status: &quot;projecting&quot; });
    }

    // Dataview can replace this code-block container after an index change.
    // Persisted state survives that replacement when the old DOM cannot be reused.
    const persisted = window.PeopleCore.readWorkspaceState(window.sessionStorage);
    const priorWorkspaceApi = workspaceApi;
    const live = priorWorkspaceApi &amp;&amp; priorWorkspaceApi.getState ? priorWorkspaceApi.getState() : null;
    const st = live || persisted;
    const model = window.PeopleCore.buildPeopleWorkspaceModel(rawPeople, sourcePages, {
      query: st &amp;&amp; st.query ? st.query : &quot;&quot;,
      filter: st &amp;&amp; st.filter ? st.filter : &quot;all&quot;,
      sort: st &amp;&amp; st.sort ? st.sort : &quot;name_asc&quot;,
      maxPreview: 3
    });
    endPersonalMeasurement(&quot;projection&quot;, personalProjectionToken, { scope: &quot;personal&quot;, status: &quot;projected&quot; });
    if (!personalDomRenderToken &amp;&amp; personalPerformance &amp;&amp; !personalMeasurementClosed.dom_render) {
      personalDomRenderToken = personalPerformance.start(&quot;dom_render&quot;, { scope: &quot;personal&quot;, status: &quot;rendering&quot; });
    }
    if (priorWorkspaceApi) {
      const disposePriorWorkspace = priorWorkspaceApi.destroy || priorWorkspaceApi.dispose || priorWorkspaceApi.cleanup;
      if (typeof disposePriorWorkspace === &quot;function&quot;) disposePriorWorkspace.call(priorWorkspaceApi);
      if (workspaceApi === priorWorkspaceApi) workspaceApi = null;
    }
    peopleMount.empty();
    workspaceApi = window.PeopleView.renderPeopleWorkspace({
      app,
      container: peopleMount,
      model,
      rawPeople,
      sourcePages,
      selectedPath: st &amp;&amp; st.selectedPath ? st.selectedPath : &quot;&quot;,
      title: &quot;사람과 관계&quot;,
      subtitle: &quot;이름 클릭 = 관계 맥락 · 관계 편집과 원본 노트는 상세에서 · 최근 맥락은 연결된 원본 기록입니다.&quot;,
      onRefresh: () =&gt; paintPeople({ force: true }),
      onStateChange: (next) =&gt; window.PeopleCore.writeWorkspaceState(window.sessionStorage, next)
    });
    endPersonalMeasurement(&quot;dom_render&quot;, personalDomRenderToken, { scope: &quot;personal&quot;, status: &quot;rendered&quot; });
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
    if (workspaceApi &amp;&amp; workspaceApi.getState) {
      window.PeopleCore.writeWorkspaceState(window.sessionStorage, workspaceApi.getState());
    }
  };
  const markPlacesReady = () =&gt; {
    if (personalPlacesReadyMarked || !personalPerformance || typeof personalPerformance.markReady !== &quot;function&quot;) return;
    if (!personalShell || typeof personalShell.readinessSnapshot !== &quot;function&quot;) return;
    const snapshot = personalShell.readinessSnapshot(&quot;personal.places&quot;, {
      status: &quot;deterministic&quot;,
      settled: true,
      enabledAction: { id: &quot;personal.places.open&quot;, enabled: true },
      activated: true
    });
    const result = personalPerformance.markReady(&quot;personal.places&quot;, snapshot, { activated: true });
    if (result &amp;&amp; result.ready === true) personalPlacesReadyMarked = true;
  };

  let venueWorkspaceApi = null;
  let venueDataFingerprint = &quot;&quot;;
  let venuePaintSerial = 0;
  let placesLoaded = false;

  const toArray = (value) =&gt; {
    if (Array.isArray(value)) return value.slice();
    if (value == null || typeof value === &quot;string&quot;) return value == null ? [] : [value];
    try { return Array.from(value); } catch (_e) { return [value]; }
  };

  const dateValue = (value) =&gt; {
    if (value == null || value === &quot;&quot;) return &quot;&quot;;
    if (typeof value === &quot;number&quot;) return value;
    try {
      if (typeof value.toISO === &quot;function&quot;) return String(value.toISO());
      if (typeof value.toMillis === &quot;function&quot;) return String(new Date(value.toMillis()).toISOString());
    } catch (_e) { /* keep string fallback */ }
    return String(value);
  };

  const referenceKey = (value) =&gt; String(value == null ? &quot;&quot; : value)
    .replace(/^\[\[/, &quot;&quot;)
    .replace(/\]\]$/, &quot;&quot;)
    .split(&quot;|&quot;)[0]
    .split(&quot;#&quot;)[0]
    .replace(/\.md$/i, &quot;&quot;)
    .replace(/\\/g, &quot;/&quot;)
    .trim()
    .toLowerCase();

  const journalReferences = (page) =&gt; {
    const refs = [];
    toArray(page &amp;&amp; page.file &amp;&amp; page.file.outlinks).forEach((link) =&gt; {
      refs.push(link &amp;&amp; typeof link === &quot;object&quot; ? (link.path || link.link || &quot;&quot;) : link);
    });
    toArray(page &amp;&amp; page.outlinks).forEach((link) =&gt; {
      refs.push(link &amp;&amp; typeof link === &quot;object&quot; ? (link.path || link.link || &quot;&quot;) : link);
    });
    let rawConnections = page &amp;&amp; page.connections;
    if (rawConnections &amp;&amp; typeof rawConnections === &quot;object&quot; &amp;&amp; !Array.isArray(rawConnections)) {
      try { rawConnections = Array.from(rawConnections); } catch (_e) { /* keep original */ }
    }
    const connectionValues = window.VenueStore &amp;&amp; window.VenueStore.normalizeConnections
      ? window.VenueStore.normalizeConnections(rawConnections)
      : toArray(rawConnections);
    connectionValues.forEach((link) =&gt; {
      refs.push(link &amp;&amp; typeof link === &quot;object&quot; ? (link.path || link.link || &quot;&quot;) : link);
    });
    return refs.map(referenceKey).filter(Boolean);
  };

  const collectVenueWorkspaceItems = async () =&gt; {
    // Both scans are folder-bounded: Venue notes for current body, Daily pages
    // for reverse links. No full-vault file enumeration is needed here.
    const venuePages = dv.pages(&#39;&quot;PARA/RESOURCES/Venues&quot;&#39;)
      .where(p =&gt; p &amp;&amp; p.type === &quot;venue&quot;)
      .array();
    const dailyPages = dv.pages(&#39;&quot;DAILY/DAILY&quot;&#39;).array();
    const journalRows = dailyPages.map((page) =&gt; ({
      path: page &amp;&amp; page.file ? page.file.path : &quot;&quot;,
      title: page &amp;&amp; page.file ? page.file.name : &quot;&quot;,
      refs: journalReferences(page)
    })).filter((row) =&gt; row.path &amp;&amp; /^DAILY\/DAILY\//.test(row.path));

    const items = [];
    for (const page of venuePages) {
      const path = page &amp;&amp; page.file ? page.file.path : &quot;&quot;;
      if (!path) continue;
      let body = &quot;&quot;;
      try { body = await readNoteText(path); } catch (_e) { body = &quot;&quot;; }
      const title = page.file.name || page.file.basename || path.split(&quot;/&quot;).pop().replace(/\.md$/i, &quot;&quot;);
      let connections = page.connections;
      if (connections &amp;&amp; typeof connections === &quot;object&quot; &amp;&amp; !Array.isArray(connections)) {
        try { connections = Array.from(connections); } catch (_e2) { connections = String(connections); }
      }
      const normalizedConnections = window.VenueStore &amp;&amp; window.VenueStore.normalizeConnections
        ? window.VenueStore.normalizeConnections(connections)
        : toArray(connections).map((value) =&gt; String(value || &quot;&quot;).trim()).filter(Boolean);
      const venueKeys = [
        referenceKey(path),
        referenceKey(title),
        referenceKey(`[[${title}]]`)
      ].filter(Boolean);
      const journalLinks = journalRows
        .filter((journal) =&gt; journal.refs.some((ref) =&gt; venueKeys.some((key) =&gt; ref === key)))
        .map((journal) =&gt; journal.path)
        .sort((a, b) =&gt; a.localeCompare(b, &quot;ko&quot;));
      items.push({
        type: &quot;venue&quot;,
        title,
        name: title,
        path,
        venue_category: page.venue_category || &quot;&quot;,
        address: page.address || &quot;&quot;,
        connections: normalizedConnections,
        body,
        updated: dateValue(page.updated || (page.file &amp;&amp; page.file.mtime) || &quot;&quot;),
        journalLinks,
        meta: page.venue_category ? [String(page.venue_category)] : [],
        detail: page.address || &quot;&quot;
      });
    }
    items.sort((a, b) =&gt; String(a.title).localeCompare(String(b.title), &quot;ko&quot;) || a.path.localeCompare(b.path));
    return items;
  };

  const paintPlaces = async (options) =&gt; {
    const serial = ++venuePaintSerial;
    const force = Boolean(options &amp;&amp; options.force);
    const activation = Boolean(options &amp;&amp; options.activation);
    placesLoaded = true;
    const activeGuard = guardStore.get(personalHost);
    if (activeGuard) activeGuard.placesLoaded = true;
    if (!venueWorkspaceApi &amp;&amp; placesMount &amp;&amp; typeof placesMount.empty === &quot;function&quot; &amp;&amp; typeof placesMount.createEl === &quot;function&quot;) {
      placesMount.empty();
      placesMount.createEl(&quot;p&quot;, {
        text: &quot;장소를 불러오는 중…&quot;,
        attr: { class: &quot;ppw-empty&quot;, role: &quot;status&quot; }
      });
    }
    const places = await collectVenueWorkspaceItems();
    if (serial !== venuePaintSerial) return null;
    const fingerprint = window.VenueStore &amp;&amp; typeof window.VenueStore.venueFingerprint === &quot;function&quot;
      ? window.VenueStore.venueFingerprint(places)
      : JSON.stringify(places);
    if (!force &amp;&amp; venueWorkspaceApi &amp;&amp; fingerprint === venueDataFingerprint) {
      if (activation) markPlacesReady();
      return venueWorkspaceApi.getModel ? venueWorkspaceApi.getModel() : null;
    }

    if (window.VenueView &amp;&amp; window.VenueView.renderVenuesWorkspace) {
      if (venueWorkspaceApi &amp;&amp; typeof venueWorkspaceApi.setData === &quot;function&quot;) {
        venueWorkspaceApi.setData(places);
      } else {
        venueWorkspaceApi = window.VenueView.renderVenuesWorkspace({
          app,
          container: placesMount,
          items: places,
          title: &quot;장소&quot;,
          subtitle: &quot;반복 방문하는 장소의 현장 지식을 보존·관리합니다. 검색·필터·상세에서 맥락을 이어갑니다.&quot;,
          onRefresh: () =&gt; paintPlaces({ force: true })
        });
        if (reportPersonalControllers) reportPersonalControllers(Object.freeze({
          people: workspaceApi,
          places: venueWorkspaceApi
        }));
      }
      venueDataFingerprint = fingerprint;
      if (activation) markPlacesReady();
      return venueWorkspaceApi &amp;&amp; venueWorkspaceApi.getModel ? venueWorkspaceApi.getModel() : null;
    }

    placesMount.empty();
    placesMount.addClass(&quot;prodigy-people-workspace&quot;);
    if (window.ProdigyListWorkspace) {
      window.ProdigyListWorkspace.render({
        app,
        container: placesMount,
        title: &quot;장소&quot;,
        subtitle: &quot;반복 방문하는 장소의 현장 지식을 보존·관리합니다. 이름을 클릭하면 상세를 엽니다.&quot;,
        actions: [],
        sections: [{
          title: &quot;장소&quot;,
          items: places,
          empty: &quot;등록된 장소가 없습니다. 위의 &#39;장소 추가&#39;로 추가하세요.&quot;
        }]
      });
      const h1 = placesMount.querySelector(&quot;h1&quot;);
      if (h1 &amp;&amp; !String(h1.textContent || &quot;&quot;).trim()) h1.style.display = &quot;none&quot;;
    } else {
      placesMount.createEl(&quot;p&quot;, { text: &quot;등록된 장소가 없습니다.&quot;, attr: { class: &quot;ppw-empty&quot; } });
    }
    venueDataFingerprint = fingerprint;
    if (activation) markPlacesReady();
    return null;
  };
  handlePersonalTabChange = (tabId) =&gt; {
    writePersonalTab(tabId);
    const activeGuard = guardStore.get(personalHost);
    if (activeGuard) activeGuard.activeTab = tabId;
    if (tabId !== &quot;places&quot;) return;
    placesLoaded = true;
    void paintPlaces({ activation: true }).catch(() =&gt; {
      if (personalPanels.places &amp;&amp; typeof personalPanels.places.empty === &quot;function&quot; &amp;&amp; typeof personalPanels.places.createEl === &quot;function&quot;) {
        personalPanels.places.empty();
        personalPanels.places.createEl(&quot;p&quot;, {
          text: &quot;장소를 불러오지 못했습니다.&quot;,
          attr: { class: &quot;ppw-empty&quot;, role: &quot;alert&quot; }
        });
      }
    });
  };

  await paintPeople({ snapshot: initialSnapshot });
  const peopleSnapshot = personalShell &amp;&amp; typeof personalShell.readinessSnapshot === &quot;function&quot;
    ? personalShell.readinessSnapshot(&quot;personal.people&quot;, {
        status: &quot;deterministic&quot;,
        settled: true,
        enabledAction: { id: &quot;personal.people.open&quot;, enabled: true }
      })
    : null;
  if (personalPerformance &amp;&amp; peopleSnapshot) personalPerformance.markReady(&quot;personal.people&quot;, peopleSnapshot);
  if (personalTabs.getActiveTab() === &quot;places&quot;) await paintPlaces();
  mountContext.scope.track(() =&gt; {
    const activeGuard = guardStore.get(personalHost);
    if (activeGuard &amp;&amp; activeGuard.shellElement === personalShell.element) guardStore.delete(personalHost);
    [workspaceApi, venueWorkspaceApi, adaptivePersonalTabs].forEach((resource) =&gt; {
      if (!resource) return;
      const dispose = resource.dispose || resource.cleanup || resource.destroy;
      if (typeof dispose === &quot;function&quot;) dispose.call(resource);
    });
  });
    } }
  });
} catch (error) {
  if (window.ProdigyHubLoader &amp;&amp; typeof window.ProdigyHubLoader.preserveRequiredRecovery === &quot;function&quot; &amp;&amp; window.ProdigyHubLoader.preserveRequiredRecovery(error, this.container)) return;
  endPersonalMeasurement(&quot;data_scan&quot;, personalDataScanToken, { scope: &quot;personal&quot;, status: &quot;failed&quot; });
  endPersonalMeasurement(&quot;projection&quot;, personalProjectionToken, { scope: &quot;personal&quot;, status: &quot;failed&quot; });
  endPersonalMeasurement(&quot;dom_render&quot;, personalDomRenderToken, { scope: &quot;personal&quot;, status: &quot;failed&quot; });
  if (personalPerformance &amp;&amp; typeof personalPerformance.fail === &quot;function&quot;) {
    personalPerformance.fail(error, { phase: &quot;error&quot;, scope: &quot;personal&quot; });
  }
  if (window.ProdigyWorkspaceNavigation &amp;&amp; window.ProdigyWorkspaceNavigation.renderLoaderError) {
    window.ProdigyWorkspaceNavigation.renderLoaderError(this.container, error, { title: &quot;개인&quot; });
  } else {
    this.container.empty();
    this.container.createEl(&quot;p&quot;, { text: &quot;개인 워크스페이스를 불러오지 못했습니다.&quot;, attr: { role: &quot;alert&quot; } });
  }
}
</code></pre>
