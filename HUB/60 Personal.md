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

  const peopleLabel = (window.prodigyDisplay && window.prodigyDisplay.type)
    ? window.prodigyDisplay.type("people")
    : "사람";

  const people = dv.pages('"PARA/RESOURCES/CONTACTS"')
    .where(p => p.type === "people" || p.type === "contact")
    .sort(p => p.last_contact || p.file.mtime, "desc")
    .array()
    .map(p => {
      const isLegacy = p.type === "contact";
      const kind = isLegacy ? "레거시" : peopleLabel;
      const relation = p.relationship || p.role || kind;
      return {
        title: p.file.name,
        path: p.file.path,
        meta: [relation, p.company || "", isLegacy ? "읽기 호환" : ""].filter(Boolean),
        detail: p.last_contact ? `최근 연락 ${p.last_contact}` : (isLegacy ? "type: contact (신규 생성 금지)" : "")
      };
    });

  const areas = dv.pages('"PARA/AREAS"')
    .where(p => p.type === "area_family" || p.type === "area_note")
    .sort(p => p.file.mtime, "desc")
    .array()
    .map(p => ({
      title: p.file.name,
      path: p.file.path,
      meta: ["지속 영역", p.file.mtime.toFormat("yyyy-MM-dd")],
      detail: p.summary || ""
    }));

  window.ProdigyListWorkspace.render({
    app,
    container: this.container,
    title: "사람과 영역",
    subtitle: "관계의 맥락(People)과 지속적으로 관리할 영역을 확인합니다. CRM·대시보드가 아닙니다.",
    actions: [
      {
        label: "사람 추가",
        primary: true,
        onClick: () => window.PeopleView && window.PeopleView.openCreateFlow(app)
      }
    ],
    sections: [
      { title: peopleLabel, items: people, empty: "등록된 사람이 없습니다. 「사람 추가」로 만드세요." },
      { title: "지속 영역", items: areas, empty: "관리 중인 영역이 없습니다." }
    ]
  });
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
