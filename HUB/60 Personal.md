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
  await loadProdigyScript("SYSTEM/Views/display-registry.js");
  await loadProdigyScript("SYSTEM/Views/prodigy-ui.js");
  await loadProdigyScript("SYSTEM/Views/workspace-list-view.js");
  await loadProdigyScript("SYSTEM/Views/people-core.js");
  await loadProdigyScript("SYSTEM/Views/people-store.js");
  await loadProdigyScript("SYSTEM/Views/people-view.js");

  const rootEl = this.container;
  rootEl.empty();

  // People surface (primary)
  const peopleMount = rootEl.createDiv({ attr: { class: "personal-people-mount" } });
  // Areas surface (supporting)
  const areasMount = rootEl.createDiv({ attr: { class: "personal-areas-mount prodigy-people-workspace" } });

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
      mtime: p.file.mtime
    };
  };

  const collectRawPeople = () => {
    return dv.pages('"PARA/RESOURCES/CONTACTS"')
      .where(p => p.type === "people" || p.type === "contact")
      .array()
      .map(p => ({
        path: p.file.path,
        type: p.type,
        name: p.file.name,
        title: p.title,
        relationship: p.relationship,
        company: p.company,
        role: p.role,
        last_contact: p.last_contact,
        body: ""
      }));
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

  let workspaceApi = null;

  const paintPeople = () => {
    const rawPeople = collectRawPeople();
    const sourcePages = collectSourcePages();
    const model = window.PeopleCore.buildPeopleWorkspaceModel(rawPeople, sourcePages, {
      query: workspaceApi && workspaceApi.getState ? workspaceApi.getState().query : "",
      filter: workspaceApi && workspaceApi.getState ? workspaceApi.getState().filter : "all",
      maxPreview: 3
    });
    peopleMount.empty();
    workspaceApi = window.PeopleView.renderPeopleWorkspace({
      app,
      container: peopleMount,
      model,
      rawPeople,
      sourcePages,
      title: "사람과 관계",
      subtitle: "중요한 사람을 찾고, 함께한 기록과 관계의 맥락을 이어갑니다.",
      onRefresh: () => paintPeople()
    });
  };

  const paintAreas = () => {
    if (window.PeopleView && window.PeopleView.ensureWorkspaceStyles) {
      window.PeopleView.ensureWorkspaceStyles();
    }
    areasMount.empty();
    areasMount.addClass("prodigy-people-workspace");
    const wrap = areasMount.createEl("details", { attr: { class: "ppw-areas" } });
    // Supporting section — collapsed by default on first paint
    wrap.createEl("summary", { text: "지속 영역" });
    const body = wrap.createDiv({ attr: { style: "padding-top:10px;" } });

    const areas = dv.pages('"PARA/AREAS"')
      .where(p => p.type === "area_family" || p.type === "area_note")
      .sort(p => p.file.mtime, "desc")
      .array()
      .map(p => ({
        title: p.file.name,
        path: p.file.path,
        meta: [p.file.mtime.toFormat("yyyy-MM-dd")],
        detail: p.summary || "",
        actions: []
      }));

    if (window.ProdigyListWorkspace) {
      window.ProdigyListWorkspace.render({
        app,
        container: body,
        title: "",
        subtitle: "지속적으로 관리하는 삶의·운영 축입니다.",
        actions: [],
        sections: [
          {
            title: "영역",
            items: areas,
            empty: "관리 중인 영역이 없습니다."
          }
        ]
      });
      // Hide empty h1 from list workspace when title is blank
      const h1 = body.querySelector("h1");
      if (h1 && !String(h1.textContent || "").trim()) h1.style.display = "none";
    } else {
      body.createEl("p", { text: "관리 중인 영역이 없습니다.", attr: { class: "ppw-empty" } });
    }
  };

  paintPeople();
  paintAreas();
} catch (error) {
  this.container.empty();
  this.container.createEl("p", {
    text: "Personal 워크스페이스를 불러오지 못했습니다.",
    attr: { style: "color:var(--text-error);" }
  });
  if (window.prodigyDebugMode === true) {
    this.container.createEl("pre", { text: error.stack || error.message });
  }
}
```
