---
created: 2026-07-23 13:55
tag: " 외국도서 경제경영 자기계발/처세술 처세술/삶과행복"
title: Thriving at Work： Make Your Mark, Lead with Confidence, Stomp Out Drama, Get Home by 6:00
author: ""
category: 외국도서
total_page: 132
publish_date: 2018-04-16
cover_url: https://image.yes24.com/momo/TopCate2415/MidCate007/241460327.jpg
status: 🟩 완료
start_read_date: 2026-07-23
finish_read_date: 2026-07-23
my_rate: 0
book_note: ❌
---

# Thriving at Work： Make Your Mark, Lead with Confidence, Stomp Out Drama, Get Home by 6:00

## 책소개

<p><strong>Why “survive” when you can thrive?</strong></p><p>Imagine walking into work each day with more joy, energy, and purpose.? Now you can?and you can set a meaningful example for those around you.? <em>Thriving at Work</em> will inspire and empower you to:</p>
<ul>
<li>Make positive self-care a daily habit (p. 7)</li>
<li>Carry yourself with more confidence (p. 55)</li>
<li>Eliminate 99% of stressful drama with this one simple sentence (p. 83)</li>
<li>Make a meaningful difference, right where you are (p. 86)</li>
</ul>



## 목차
undefined

---
cssclasses:
  - hide-properties_editing
  - hide-properties_reading
---

```dataviewjs
window.obsidian = obsidian;
window.app = app;

const loadProdigyScript = async (path) => {
  const tFile = app.vault.getAbstractFileByPath(path);
  if (tFile) {
    const content = await app.vault.read(tFile);
    (new Function(content))();
  }
};

const main = async () => {
  try {
    await loadProdigyScript("SYSTEM/Views/display-registry.js");
    await loadProdigyScript("SYSTEM/Views/prodigy-ui.js");
    await loadProdigyScript("SYSTEM/Views/object-lifecycle-core.js");
    await loadProdigyScript("SYSTEM/Views/object-lifecycle-view.js");
    await loadProdigyScript("SYSTEM/Views/object-engine-core.js");
    await loadProdigyScript("SYSTEM/Views/project-todoist-adapter.js");
    await loadProdigyScript("SYSTEM/Views/ai-provider-service.js");
    await loadProdigyScript("SYSTEM/Views/project-workflow-draft-service.js");
    await loadProdigyScript("SYSTEM/Views/morning-context-core.js");
    await loadProdigyScript("SYSTEM/Views/morning-brief-service.js");
    await loadProdigyScript("SYSTEM/Views/morning-brief-context.js");
    await loadProdigyScript("SYSTEM/Views/morning-cache.js");
    await loadProdigyScript("SYSTEM/Views/journal-core.js");
    await loadProdigyScript("SYSTEM/Views/journal-store.js");
    await loadProdigyScript("SYSTEM/Views/daily-reflection-ai.js");
    await loadProdigyScript("SYSTEM/Views/journal-view.js");
    await loadProdigyScript("SYSTEM/Views/workspace-registry.js");
    await loadProdigyScript("SYSTEM/Views/workspace-launcher-core.js");
    await loadProdigyScript("SYSTEM/Views/workspace-launcher-view.js");
    await loadProdigyScript("SYSTEM/Views/object-creator-core.js");
    await loadProdigyScript("SYSTEM/Views/object-creator-view.js");
    // Creators that Universal Object Creator reuses (optional if already loaded elsewhere)
    await loadProdigyScript("SYSTEM/Views/people-core.js");
    await loadProdigyScript("SYSTEM/Views/people-store.js");
    await loadProdigyScript("SYSTEM/Views/people-view.js");
    await loadProdigyScript("SYSTEM/Views/reading-book-create.js");
    await loadProdigyScript("SYSTEM/Views/project-wizard-core.js");
    await loadProdigyScript("SYSTEM/Views/project-wizard.js");
    await loadProdigyScript("SYSTEM/Views/home-view.js");

    if (window.HomeView) {
      await window.HomeView.renderHome({
        app: app,
        dv: dv,
        container: this.container
      });
    } else {
      this.container.createEl("div", {
        text: "❌ HomeView component not found.",
        attr: { style: "color: var(--text-error);" }
      });
    }
  } catch (err) {
    this.container.empty();
    const errCard = this.container.createEl("div", {
      attr: { style: "background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; padding: 16px; margin: 12px 0; color: #ef4444;" }
    });
    errCard.createEl("h4", { text: "⚠️ 홈 화면 스크립트 로드 실패" });
    errCard.createEl("div", {
      text: window.prodigyDebugMode ? (err.stack || err.message) : "Home을 다시 열거나 Obsidian을 재시작해 주세요.",
      attr: { style: "font-size: 0.8em; white-space: pre-wrap;" }
    });
  }
};

await main();
```
