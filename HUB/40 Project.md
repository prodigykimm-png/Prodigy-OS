<!--memoge:html-->
<hr>
<p>cssclasses:</p>
<ul>
<li>prodigy-hub-note</li>
<li>hide-properties_reading</li>
</ul>
<hr>
<pre><code class="language-js-engine">const file = app.workspace.getActiveFile();
if (!file) return;
if (!container) return;
container.empty();

// Expose globals for external scripts
window.obsidian = obsidian;
window.app = app;
window.__prodigyMeasurementEntry = window.__prodigyMeasurementEntry &amp;&amp; window.__prodigyMeasurementEntry.workspaceId === &quot;project&quot;
  ? window.__prodigyMeasurementEntry
  : { workspaceId: &quot;project&quot; };
const loadWorkspaceBootstrap = async (path) =&gt; {
  const file = app.vault.getAbstractFileByPath(path);
  if (!file) throw new Error(`워크스페이스 부트스트랩 파일이 없습니다: ${path}`);
  (new Function(await app.vault.read(file)))();
};
if (!window.ProdigyWorkspaceManifest) await loadWorkspaceBootstrap(&quot;SYSTEM/Views/prodigy-workspace-manifest.js&quot;);
if (!window.ProdigyHubLoader) await loadWorkspaceBootstrap(&quot;SYSTEM/Views/prodigy-hub-loader.js&quot;);
const projectManifest = window.ProdigyWorkspaceManifest.get(&quot;project&quot;);
const projectLayoutParticipants = new Set();
const projectSectionRefreshers = new Map();
window.__prodigyRefreshProjectSections = () =&gt; {
  let rendered = true;
  projectSectionRefreshers.forEach((refresh) =&gt; {
    if (refresh() === false) rendered = false;
  });
  return rendered;
};
window.prodigyProjectReady = window.ProdigyHubLoader.mountWorkspace(app, projectManifest, {
  container,
  renderers: { project: async (mountContext) =&gt; {
  window.__prodigyProjectMountScope = mountContext.scope;
  mountContext.scope.track(() =&gt; { if (window.__prodigyProjectMountScope === mountContext.scope) delete window.__prodigyProjectMountScope; });
  window.renderResponsiveProjectSection = (options) =&gt; {
    if (!window.renderDashboardSection || !window.renderProjectCard) return false;
    const render = () =&gt; {
      const host = options.container;
      const explicitWidth = Number(options.logicalWidth);
      const measuredWidth = Number(host.clientWidth);
      const logicalWidth = Number.isFinite(explicitWidth)
        ? explicitWidth
        : Number.isFinite(measuredWidth) &amp;&amp; measuredWidth &gt; 0 ? measuredWidth : window.ProdigyTokens.RESPONSIVE_BREAKPOINTS.smallDesktopMax;
      const layout = window.ProjectWizardCore.resolveProjectWorkspaceLayout(logicalWidth);
      const state = window.prodigyProjectWorkspaceStateStore?.getWorkspaceState(&quot;project&quot;) || {};
      host.empty();
      const list = host.createEl(&quot;div&quot;, {
        attr: {
          class: &quot;prodigy-project-list&quot;,
          &quot;data-density&quot;: layout.density,
          style: `display:grid;grid-template-columns:repeat(${options.isCollapsed ? 1 : layout.columns},minmax(0,1fr));gap:10px;min-inline-size:0;`
        }
      });
      return window.renderDashboardSection(Object.assign({}, options, {
        type: &quot;project&quot;,
        container: list,
        projectTypeFilter: state.filters?.project_type || &quot;all&quot;,
        renderer: window.renderProjectCard
      }));
    };
    projectSectionRefreshers.set(String(options.status || &quot;&quot;), render);
    return render();
  };
  const scopedProjectRenderer = window.renderResponsiveProjectSection;
  mountContext.scope.track(() =&gt; {
    if (window.renderResponsiveProjectSection === scopedProjectRenderer) delete window.renderResponsiveProjectSection;
    if (window.__prodigyRefreshProjectSections) delete window.__prodigyRefreshProjectSections;
    projectSectionRefreshers.clear();
    delete window.__prodigyProjectShell;
  });
  const projectShell = window.ProdigyWorkspaceNavigation.mount(container, { app, workspaceId: &quot;project&quot;, title: &quot;프로젝트&quot;, mountScope: mountContext.scope });
  window.prodigyProjectWorkspaceStateStore = projectShell.stateStore;
  mountContext.scope.track(() =&gt; {
    if (window.prodigyProjectWorkspaceStateStore === projectShell.stateStore) {
      delete window.prodigyProjectWorkspaceStateStore;
    }
  });
  projectShell.body.createEl(&quot;style&quot;, { text: &#39;.prodigy-app-shell[data-workspace-id=&quot;project&quot;]&gt;.prodigy-workspace-bar{padding-inline:4px}&#39; });
  const projectKnowledge = await window.ProjectContextAdapter.mountResurfacing({
    app,
    signal: mountContext.signal,
    container: projectShell.body
  });
  if (projectKnowledge &amp;&amp; typeof projectKnowledge.dispose === &quot;function&quot;) mountContext.scope.track(projectKnowledge.dispose);
  window.__prodigyProjectShell = projectShell;
  window.__prodigyProjectMeasurement = {
    performance: projectShell.performance,
    dataScanToken: null,
    projectionToken: null,
    domRenderToken: null,
    closed: { data_scan: false, projection: false, dom_render: false }
  };
  } }
});
window.__prodigyProjectLayoutAck = async (participant) =&gt; {
  const mounted = await window.prodigyProjectReady;
  if (!mounted || mounted.signal.aborted) throw new Error(&quot;프로젝트 마운트가 닫히지 않았습니다.&quot;);
  projectLayoutParticipants.add(String(participant));
  if (projectLayoutParticipants.size !== 7) return;
  const shell = window.__prodigyProjectShell &amp;&amp; window.__prodigyProjectShell.element;
  if (!shell || typeof shell.dispatchEvent !== &quot;function&quot;) throw new Error(&quot;프로젝트 레이아웃 소유자가 없습니다.&quot;);
  const emitSettled = () =&gt; shell.dispatchEvent(new CustomEvent(&quot;prodigy-project-layout-settled&quot;, { bubbles: true, detail: {
    workspaceId: &quot;project&quot;,
    mountGeneration: mounted.mountGeneration,
    participants: [...projectLayoutParticipants].sort()
  } }));
  if (!shell.__prodigyProjectLayoutAcknowledger) {
    const acknowledge = (event) =&gt; {
      if (Number(event &amp;&amp; event.detail &amp;&amp; event.detail.mountGeneration) === mounted.mountGeneration) emitSettled();
    };
    shell.__prodigyProjectLayoutAcknowledger = acknowledge;
    shell.addEventListener(&quot;prodigy-project-layout-request&quot;, acknowledge);
    mounted.scope.track(() =&gt; shell.removeEventListener(&quot;prodigy-project-layout-request&quot;, acknowledge));
  }
  emitSettled();
};

try {
  await window.prodigyProjectReady;
} catch (err) {
  const preservesRequiredRecovery = window.ProdigyHubLoader &amp;&amp; typeof window.ProdigyHubLoader.preserveRequiredRecovery === &quot;function&quot; &amp;&amp; window.ProdigyHubLoader.preserveRequiredRecovery(err, container);
  if (!preservesRequiredRecovery) {
    if (window.ProdigyWorkspaceNavigation &amp;&amp; window.ProdigyWorkspaceNavigation.renderLoaderError) {
      window.ProdigyWorkspaceNavigation.renderLoaderError(container, err, { title: &quot;프로젝트&quot; });
    } else {
      container.empty();
      container.createEl(&quot;p&quot;, { text: &quot;프로젝트 워크스페이스를 불러오지 못했습니다.&quot;, attr: { role: &quot;alert&quot; } });
    }
  }
  return;
}
</code></pre>
<h1>프로젝트 실행</h1>
<pre><code class="language-js-engine">if (!container) return;
container.empty();
await window.prodigyProjectReady;

const refreshProjectViews = () =&gt; {
  try {
    const dvPlugin = app.plugins?.plugins?.dataview;
    if (dvPlugin?.api?.index?.touch) dvPlugin.api.index.touch();
  } catch (_error) { /* ignore */ }
  try {
    app.workspace.trigger(&quot;dataview:refresh-views&quot;);
  } catch (_error) { /* ignore */ }
  try {
    if (app.commands?.executeCommandById) {
      app.commands.executeCommandById(&quot;dataview:dataview-force-refresh-views&quot;);
    }
  } catch (_error) { /* ignore */ }
};
const refreshProjectAfterMutation = () =&gt; {
  try {
    app.workspace.trigger(&quot;dataview:refresh-views&quot;);
  } catch (_error) { /* Project keeps the saved card state visible. */ }
};
window.__prodigyRefreshProjectViews = refreshProjectAfterMutation;
window.__prodigyProjectMountScope?.track(() =&gt; {
  if (window.__prodigyRefreshProjectViews === refreshProjectAfterMutation) delete window.__prodigyRefreshProjectViews;
});

const tokens = window.ProdigyTokens;
const measuredWidth = Number(container.clientWidth);
const logicalWidth = Number.isFinite(measuredWidth) &amp;&amp; measuredWidth &gt; 0
  ? measuredWidth
  : tokens.RESPONSIVE_BREAKPOINTS.smallDesktopMax;
const layout = window.ProjectWizardCore.resolveProjectWorkspaceLayout(logicalWidth);
container.setAttribute(&quot;data-density&quot;, layout.density);

const adaptiveBar = window.ProdigyAdaptiveControls.AdaptiveActionBar(container, {
  label: &quot;프로젝트 실행 작업&quot;,
  actions: [{
    label: &quot;+ 프로젝트 시작&quot;,
    onClick: () =&gt; {
      if (window.openProjectWizard) {
        window.openProjectWizard({ logicalWidth });
      } else {
        new Notice(&quot;프로젝트 시작 도구를 불러오지 못했습니다.&quot;, 9000);
      }
    }
  }],
  secondaryActions: [{ label: &quot;새로 고침&quot;, onClick: refreshProjectViews }],
  sheetTitle: &quot;프로젝트 보조 작업&quot;
});
adaptiveBar.element.style.minBlockSize = `${layout.actionBarHeight}px`;
const launchButton = adaptiveBar.primary.querySelector(&quot;button&quot;);
if (launchButton) {
  launchButton.classList.add(&quot;prodigy-btn-primary&quot;);
  launchButton.setAttribute(&quot;data-project-action&quot;, &quot;open-wizard&quot;);
}

const projectStateStore = window.prodigyProjectWorkspaceStateStore
  || window.ProdigyWorkspaceNavigation.getStateStore();
const storedProjectState = projectStateStore.getWorkspaceState(&quot;project&quot;);
let selectedProjectType = storedProjectState.filters?.project_type || &quot;all&quot;;

const filterRow = container.createEl(&quot;div&quot;, {
  attr: {
    class: &quot;prodigy-project-type-filter&quot;,
    style: `display:grid;grid-template-columns:${layout.density === &quot;compact&quot; ? &quot;repeat(2,minmax(0,1fr))&quot; : &quot;repeat(6,max-content)&quot;};gap:6px;align-items:center;margin:4px 0 12px;min-inline-size:0;`
  }
});
filterRow.createEl(&quot;span&quot;, {
  text: &quot;유형&quot;,
  attr: { style: &quot;font-size:var(--ke-type-label);font-weight:700;color:var(--ke-color-muted);margin-right:4px;&quot; }
});

const filterOptions = [
  { key: &quot;all&quot;, label: &quot;전체&quot; },
  { key: &quot;business&quot;, label: &quot;사업&quot; },
  { key: &quot;work&quot;, label: &quot;회사&quot; },
  { key: &quot;personal&quot;, label: &quot;개인&quot; },
  { key: &quot;uncategorized&quot;, label: &quot;미분류&quot; }
];
const filterButtons = [];

const styleFilterButton = (btn, active) =&gt; {
  btn.classList.toggle(&quot;is-active&quot;, !!active);
  btn.classList.add(&quot;prodigy-btn&quot;, &quot;prodigy-btn-chip&quot;);
  btn.disabled = false;
  btn.style.pointerEvents = &quot;auto&quot;;
  if (layout.density === &quot;compact&quot;) {
    btn.style.minBlockSize = `${layout.touchTarget}px`;
    btn.style.minInlineSize = `${layout.touchTarget}px`;
  }
};

filterOptions.forEach((item) =&gt; {
  const btn = window.ProdigyUI
    ? window.ProdigyUI.button(filterRow, item.label, {
      chip: true,
      active: selectedProjectType === item.key
    })
    : filterRow.createEl(&quot;button&quot;, {
      text: item.label,
      attr: { type: &quot;button&quot;, class: &quot;prodigy-btn prodigy-btn-chip&quot; }
    });
  styleFilterButton(btn, selectedProjectType === item.key);
  filterButtons.push({ key: item.key, btn });

  const onProjectTypeFilter = (event) =&gt; {
    event.preventDefault();
    event.stopPropagation();
    selectedProjectType = item.key;
    const currentState = projectStateStore.getWorkspaceState(&quot;project&quot;);
    projectStateStore.setWorkspaceState(&quot;project&quot;, {
      filters: { ...(currentState.filters || {}), project_type: item.key },
      density: layout.density
    });
    filterButtons.forEach(({ key, btn: other }) =&gt; {
      styleFilterButton(other, key === item.key);
    });
    window.__prodigyRefreshProjectSections();
  };
  const projectScope = window.__prodigyProjectMountScope;
  if (projectScope &amp;&amp; typeof projectScope.listen === &quot;function&quot;) projectScope.listen(btn, &quot;click&quot;, onProjectTypeFilter);
  else btn.addEventListener(&quot;click&quot;, onProjectTypeFilter);
});
</code></pre>
<h1>객체 라이프사이클</h1>
<pre><code class="language-dataviewjs">// Collapsed by default — Today is the primary operating surface
const host = this.container;
host.empty();
await window.prodigyProjectReady;
const lifecycleWidth = Number(host.clientWidth);
const lifecycleLayout = window.ProjectWizardCore.resolveProjectWorkspaceLayout(
  Number.isFinite(lifecycleWidth) &amp;&amp; lifecycleWidth &gt; 0 ? lifecycleWidth : window.ProdigyTokens.RESPONSIVE_BREAKPOINTS.smallDesktopMax
);
const fold = host.createEl(&quot;details&quot;, {
  attr: {
    class: &quot;prodigy-lifecycle-fold&quot;,
    &quot;data-density&quot;: lifecycleLayout.density,
    style: &quot;border:1px solid var(--ke-color-border);border-radius:var(--ke-radius-control);background:var(--ke-color-surface-secondary);padding:2px 10px 8px;margin:0 0 8px;&quot;
  }
});
const summary = fold.createEl(&quot;summary&quot;, {
  text: &quot;객체 라이프사이클 · 접힘 (상태 요약)&quot;,
  attr: {
    style: `font-weight:700;font-size:var(--ke-type-heading);color:var(--ke-color-muted);cursor:pointer;min-height:${lifecycleLayout.density === &quot;compact&quot; ? lifecycleLayout.touchTarget : 36}px;display:flex;align-items:center;list-style:none;`
  }
});
const body = fold.createEl(&quot;div&quot;, { attr: { style: &quot;margin-top:6px;&quot; } });

if (window.ObjectLifecycleCore &amp;&amp; window.ObjectLifecycleView) {
  const pages = dv.pages(&#39;&quot;PARA/PROJECTS&quot;&#39;)
    .where(p =&gt; p.type === &quot;project&quot; || p.type === &quot;project_note&quot; || p.type === &quot;project_family&quot;)
    .array();
  const evaluation = window.ObjectLifecycleCore.evaluateCollection(pages);
  window.ObjectLifecycleView.renderWorkspaceSummary({
    container: body,
    counts: evaluation.counts,
    title: &quot;프로젝트 라이프사이클&quot;
  });
} else {
  body.createEl(&quot;span&quot;, {
    text: &quot;객체 라이프사이클 모듈을 불러오는 중...&quot;,
    attr: { style: &quot;color:var(--ke-color-muted);font-size:var(--ke-type-body);&quot; }
  });
}
</code></pre>
<h1>오늘</h1>
<pre><code class="language-dataviewjs">await window.prodigyProjectReady;
const projectMeasurement = window.__prodigyProjectMeasurement;
const projectPerformance = projectMeasurement &amp;&amp; projectMeasurement.performance;
const endProjectMeasurement = (phase, token, fields) =&gt; {
  if (!projectMeasurement || !projectPerformance || !token || projectMeasurement.closed[phase]) return;
  projectPerformance.end(token, fields);
  projectMeasurement.closed[phase] = true;
};
if (projectMeasurement &amp;&amp; projectPerformance &amp;&amp; !projectMeasurement.dataScanToken &amp;&amp; !projectMeasurement.closed.data_scan) {
  projectMeasurement.dataScanToken = projectPerformance.start(&quot;data_scan&quot;, { scope: &quot;project&quot;, status: &quot;scanning&quot; });
}
try {
const now = new Date();
const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2, &#39;0&#39;)}-${String(now.getDate()).padStart(2, &#39;0&#39;)}`;

const allProjects = dv.pages().where(p =&gt; p.type === &quot;project&quot;);

let dueTodayCount = 0;
let missingActionCount = 0;
let blockedCount = 0;
const activeProjects = [];

allProjects.forEach(p =&gt; {
  const isCompletedOrArchived = [&quot;completed&quot;, &quot;reviewing&quot;, &quot;archived&quot;].includes(p.status);
  
  if (!isCompletedOrArchived) {
    activeProjects.push(p);
    
    if (p.due_date === todayStr) {
      dueTodayCount++;
    }
    
    if (!p.next_action || String(p.next_action).trim() === &quot;&quot; || p.next_action === &quot;정보 없음&quot;) {
      missingActionCount++;
    }
    
    if (p.status === &quot;blocked&quot;) {
      blockedCount++;
    }
  }
});
endProjectMeasurement(&quot;data_scan&quot;, projectMeasurement &amp;&amp; projectMeasurement.dataScanToken, { scope: &quot;project&quot;, status: &quot;loaded&quot; });
if (projectMeasurement &amp;&amp; projectPerformance &amp;&amp; !projectMeasurement.projectionToken &amp;&amp; !projectMeasurement.closed.projection) {
  projectMeasurement.projectionToken = projectPerformance.start(&quot;projection&quot;, { scope: &quot;project&quot;, status: &quot;projecting&quot; });
}

activeProjects.sort((a, b) =&gt; {
  const statusWeight = { doing: 1, planning: 2, idea: 3, blocked: 4 };
  const wA = statusWeight[a.status] || 99;
  const wB = statusWeight[b.status] || 99;
  if (wA !== wB) return wA - wB;
  
  const dtA = a.due_date ? new Date(a.due_date) : null;
  const dtB = b.due_date ? new Date(b.due_date) : null;
  if (dtA &amp;&amp; dtB) return dtA - dtB;
  if (dtA) return -1;
  if (dtB) return 1;
  return 0;
});

// Prefer Object Engine primary project when available (same runtime as Launcher)
let nextProj = activeProjects[0];
let engineContinue = null;
try {
  if (window.ObjectEngine &amp;&amp; window.ObjectEngine.evaluateObjects &amp;&amp; window.ObjectEngine.selectPrimaryObject) {
    const states = window.ObjectEngine.evaluateObjects(activeProjects.array ? activeProjects.array() : activeProjects);
    const primary = window.ObjectEngine.selectPrimaryObject(states, &quot;project&quot;);
    if (primary &amp;&amp; primary.source_path) {
      const match = activeProjects.find(p =&gt; (p.file &amp;&amp; p.file.path) === primary.source_path || p.path === primary.source_path);
      if (match) nextProj = match;
      engineContinue = primary.continue_target || (window.ObjectEngine.getContinueTarget &amp;&amp; window.ObjectEngine.getContinueTarget(primary));
    }
  }
} catch (_e) {
  engineContinue = null;
}
endProjectMeasurement(&quot;projection&quot;, projectMeasurement &amp;&amp; projectMeasurement.projectionToken, { scope: &quot;project&quot;, status: &quot;projected&quot; });
if (projectMeasurement &amp;&amp; projectPerformance &amp;&amp; !projectMeasurement.domRenderToken &amp;&amp; !projectMeasurement.closed.dom_render) {
  projectMeasurement.domRenderToken = projectPerformance.start(&quot;dom_render&quot;, { scope: &quot;project&quot;, status: &quot;rendering&quot; });
}

const todayTokens = window.ProdigyTokens;
const todayWidth = Number(this.container.clientWidth);
const todayLayout = window.ProjectWizardCore.resolveProjectWorkspaceLayout(
  Number.isFinite(todayWidth) &amp;&amp; todayWidth &gt; 0 ? todayWidth : todayTokens.RESPONSIVE_BREAKPOINTS.smallDesktopMax
);
const mainBox = this.container.createEl(&#39;div&#39;, {
  attr: {
    class: &quot;prodigy-project-today prodigy-full-bleed&quot;,
    &quot;data-density&quot;: todayLayout.density,
    style: `display:grid;grid-template-columns:repeat(${todayLayout.columns},minmax(0,1fr));gap:var(--ke-space-4);min-inline-size:0;`
  }
});

const statsBox = mainBox.createEl(&#39;div&#39;, {
  attr: { class: &quot;prodigy-project-today-stats prodigy-utility-card&quot;, style: `display:flex;flex-direction:column;gap:var(--ke-space-2);min-inline-size:0;` }
});
statsBox.createEl(&#39;div&#39;, { text: &#39;오늘 현황&#39;, attr: { style: &#39;font-weight:bold;font-size:var(--ke-type-heading);color:var(--ke-color-accent);border-bottom:1px solid var(--ke-color-border);padding-bottom:4px;&#39; } });

const addStatItem = (parent, label, count, color, isHighlight) =&gt; {
  const row = parent.createEl(&#39;div&#39;, { attr: { style: &#39;display:flex;justify-content:space-between;align-items:center;font-size:var(--ke-type-body);&#39; } });
  row.createEl(&#39;span&#39;, { text: label, attr: { style: &#39;color:var(--ke-color-muted);&#39; } });
  row.createEl(&#39;span&#39;, {
    text: `${count}건`,
    attr: {
      style: `font-weight:bold;color:${color};background:${isHighlight ? todayTokens.badgeBg(color) : &#39;transparent&#39;};padding:${isHighlight ? &#39;1px 6px&#39; : &#39;0&#39;};border-radius:var(--ke-radius-control);`
    }
  });
};

addStatItem(statsBox, &#39;오늘 마감&#39;, dueTodayCount, todayTokens.COLORS.error, dueTodayCount &gt; 0);
addStatItem(statsBox, &#39;다음 행동 없음&#39;, missingActionCount, todayTokens.COLORS.warning, missingActionCount &gt; 0);
addStatItem(statsBox, &#39;지연 프로젝트&#39;, blockedCount, todayTokens.COLORS.error, blockedCount &gt; 0);

const actionBox = mainBox.createEl(&#39;div&#39;, {
  attr: { class: &quot;prodigy-project-next-action prodigy-utility-card&quot;, style: `display:flex;flex-direction:column;gap:var(--ke-space-2);min-inline-size:0;` }
});
actionBox.createEl(&#39;div&#39;, { text: &#39;다음 행동&#39;, attr: { style: &#39;font-weight:bold;font-size:var(--ke-type-heading);color:var(--ke-color-accent);border-bottom:1px solid var(--ke-color-border);padding-bottom:4px;&#39; } });

if (nextProj) {
  const linkRow = actionBox.createEl(&#39;div&#39;, { attr: { style: &#39;margin-top:2px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;&#39; } });
  const rawType = String(nextProj.project_type || &quot;&quot;).trim().toLowerCase();
  const typeLabel = rawType === &quot;business&quot; ? &quot;사업&quot; : rawType === &quot;work&quot; ? &quot;회사&quot; : rawType === &quot;personal&quot; ? &quot;개인&quot; : &quot;미분류&quot;;
  linkRow.createEl(&#39;span&#39;, {
    text: typeLabel,
    attr: { style: &#39;font-size:var(--ke-type-chrome);font-weight:700;color:var(--ke-color-muted);background:var(--ke-color-hover);padding:1px 6px;border-radius:var(--ke-radius-pill);&#39; }
  });
  const linkSpan = linkRow.createEl(&#39;span&#39;, { attr: { style: &#39;font-size:var(--ke-type-body);font-weight:bold;&#39; } });
  dv.api.renderValue(nextProj.file.link, linkSpan, dv.component, nextProj.file.path, true);
  
  const actionText = (engineContinue &amp;&amp; engineContinue.action)
    || nextProj.next_action
    || &quot;지정된 액션이 없습니다.&quot;;
  actionBox.createEl(&#39;div&#39;, {
    text: actionText,
    attr: { style: `font-size:var(--ke-type-body);color:var(--ke-color-text);background:var(--ke-color-hover);padding:6px 8px;border-radius:var(--ke-radius-control);border-left:3px solid ${todayTokens.COLORS.error};margin-top:4px;overflow-wrap:anywhere;` }
  });
} else {
  actionBox.createEl(&#39;div&#39;, { text: &#39;진행 중인 작업이 없습니다.&#39;, attr: { style: &#39;font-size:var(--ke-type-body);color:var(--ke-color-muted);text-align:center;margin-top:12px;&#39; } });
}
endProjectMeasurement(&quot;dom_render&quot;, projectMeasurement &amp;&amp; projectMeasurement.domRenderToken, { scope: &quot;project&quot;, status: &quot;rendered&quot; });
const projectShell = window.__prodigyProjectShell;
const readinessSnapshot = projectShell &amp;&amp; typeof projectShell.readinessSnapshot === &quot;function&quot;
  ? projectShell.readinessSnapshot(&quot;project&quot;, {
      status: &quot;deterministic&quot;,
      settled: true,
      enabledAction: { id: &quot;project.open&quot;, enabled: true }
    })
  : null;
if (projectPerformance &amp;&amp; readinessSnapshot) projectPerformance.markReady(&quot;project&quot;, readinessSnapshot);
} catch (error) {
  endProjectMeasurement(&quot;data_scan&quot;, projectMeasurement &amp;&amp; projectMeasurement.dataScanToken, { scope: &quot;project&quot;, status: &quot;failed&quot; });
  endProjectMeasurement(&quot;projection&quot;, projectMeasurement &amp;&amp; projectMeasurement.projectionToken, { scope: &quot;project&quot;, status: &quot;failed&quot; });
  endProjectMeasurement(&quot;dom_render&quot;, projectMeasurement &amp;&amp; projectMeasurement.domRenderToken, { scope: &quot;project&quot;, status: &quot;failed&quot; });
  if (projectPerformance &amp;&amp; typeof projectPerformance.fail === &quot;function&quot;) {
    projectPerformance.fail(error, { phase: &quot;error&quot;, scope: &quot;project&quot; });
  }
}
</code></pre>
<hr>
<h1>워크플로</h1>
<pre><code class="language-js-engine">const file = app.workspace.getActiveFile();
if (!file) return;
if (!container) return;
container.empty();
await window.prodigyProjectReady;

const allProjects = app.vault.getFiles().filter(f =&gt; {
  const c = app.metadataCache.getFileCache(f);
  return c?.frontmatter?.type === &quot;project&quot;;
});

const counts = { idea: 0, planning: 0, doing: 0, blocked: 0, completed: 0, reviewing: 0, archived: 0 };

allProjects.forEach(f =&gt; {
  const c = app.metadataCache.getFileCache(f);
  const status = c?.frontmatter?.status || &quot;idea&quot;;
  if (counts[status] !== undefined) {
    counts[status]++;
  }
});

const workflowWidth = Number(container.clientWidth);
const workflowLayout = window.ProjectWizardCore.resolveProjectWorkspaceLayout(
  Number.isFinite(workflowWidth) &amp;&amp; workflowWidth &gt; 0 ? workflowWidth : window.ProdigyTokens.RESPONSIVE_BREAKPOINTS.smallDesktopMax
);
const pipelineBox = container.createEl(&#39;div&#39;, {
  attr: {
    class: &quot;prodigy-project-pipeline prodigy-utility-card&quot;,
    &quot;data-density&quot;: workflowLayout.density,
    style: `display:grid;grid-template-columns:repeat(${workflowLayout.columns},minmax(0,1fr));gap:var(--ke-space-3);min-inline-size:0;`
  }
});

const statusStep = (status) =&gt; {
  const info = window.prodigyDisplay.statusInfo(status);
  const count = counts[status] || 0;
  const step = pipelineBox.createEl(&#39;div&#39;, {
    attr: { style: `display:flex;justify-content:space-between;align-items:center;gap:var(--ke-space-3);background:var(--ke-color-hover);border:var(--ke-border-width) solid ${info.color};border-radius:var(--ke-radius-control);padding:var(--ke-space-2) var(--ke-space-3);min-inline-size:0;min-block-size:${workflowLayout.density === &quot;compact&quot; ? &quot;var(--ke-touch-target)&quot; : &quot;var(--ke-control-height)&quot;};` }
  });
  step.createEl(&#39;span&#39;, { text: info.label, attr: { style: &#39;font-size:var(--ke-type-label);color:var(--ke-color-muted);font-weight:bold;overflow-wrap:anywhere;&#39; } });
  step.createEl(&#39;span&#39;, { text: String(count), attr: { style: `font-size: var(--ke-type-title); font-weight: bold; color: ${info.color};` } });
  return step;
};

statusStep(&#39;idea&#39;);
statusStep(&#39;planning&#39;);
statusStep(&#39;doing&#39;);
statusStep(&#39;blocked&#39;);
statusStep(&#39;completed&#39;);
statusStep(&#39;reviewing&#39;);
statusStep(&#39;archived&#39;);
</code></pre>
<hr>
<h2>진행 중</h2>
<pre><code class="language-dataviewjs">const run = () =&gt; {
  if (window.renderResponsiveProjectSection) {
    return window.renderResponsiveProjectSection({
      dv: dv,
      status: &quot;doing&quot;,
      container: this.container,
      logicalWidth: this.container.clientWidth,
      emptyMessage: &quot;진행 중인 프로젝트가 없습니다.&quot;,
      sortField: &quot;due_date&quot;,
      sortOrder: &quot;asc&quot;
    });
  }
  return false;
};
if (!run()) {
  await window.prodigyProjectReady;
  if (!run()) throw new Error(&quot;프로젝트 대시보드 렌더러가 준비되지 않았습니다.&quot;);
}
await window.__prodigyProjectLayoutAck(&quot;doing&quot;);
</code></pre>
<hr>
<h2>계획</h2>
<pre><code class="language-dataviewjs">const run = () =&gt; {
  if (window.renderResponsiveProjectSection) {
    return window.renderResponsiveProjectSection({
      dv: dv,
      status: &quot;planning&quot;,
      container: this.container,
      logicalWidth: this.container.clientWidth,
      emptyMessage: &quot;기획 중인 프로젝트가 없습니다.&quot;,
      sortField: &quot;due_date&quot;,
      sortOrder: &quot;asc&quot;
    });
  }
  return false;
};
if (!run()) {
  await window.prodigyProjectReady;
  if (!run()) throw new Error(&quot;프로젝트 대시보드 렌더러가 준비되지 않았습니다.&quot;);
}
await window.__prodigyProjectLayoutAck(&quot;planning&quot;);
</code></pre>
<hr>
<h2>아이디어</h2>
<pre><code class="language-dataviewjs">const run = () =&gt; {
  if (window.renderResponsiveProjectSection) {
    return window.renderResponsiveProjectSection({
      dv: dv,
      status: &quot;idea&quot;,
      container: this.container,
      logicalWidth: this.container.clientWidth,
      emptyMessage: &quot;아이디어 단계의 프로젝트가 없습니다.&quot;,
      sortField: &quot;due_date&quot;,
      sortOrder: &quot;asc&quot;
    });
  }
  return false;
};
if (!run()) {
  await window.prodigyProjectReady;
  if (!run()) throw new Error(&quot;프로젝트 대시보드 렌더러가 준비되지 않았습니다.&quot;);
}
await window.__prodigyProjectLayoutAck(&quot;idea&quot;);
</code></pre>
<hr>
<h2>지연</h2>
<pre><code class="language-dataviewjs">const run = () =&gt; {
  if (window.renderResponsiveProjectSection) {
    return window.renderResponsiveProjectSection({
      dv: dv,
      status: &quot;blocked&quot;,
      container: this.container,
      logicalWidth: this.container.clientWidth,
      emptyMessage: &quot;해당 조건의 지연된 프로젝트가 없습니다.&quot;,
      isCollapsed: true,
      summaryText: &quot;지연된 프로젝트 목록&quot;,
      summaryColor: window.ProdigyTokens.COLORS.error,
      sortField: &quot;due_date&quot;,
      sortOrder: &quot;asc&quot;
    });
  }
  return false;
};
if (!run()) {
  await window.prodigyProjectReady;
  if (!run()) throw new Error(&quot;프로젝트 대시보드 렌더러가 준비되지 않았습니다.&quot;);
}
await window.__prodigyProjectLayoutAck(&quot;blocked&quot;);
</code></pre>
<h2>완료</h2>
<pre><code class="language-dataviewjs">const run = () =&gt; {
  if (window.renderResponsiveProjectSection) {
    return window.renderResponsiveProjectSection({
      dv: dv,
      status: &quot;completed&quot;,
      container: this.container,
      logicalWidth: this.container.clientWidth,
      emptyMessage: &quot;해당 조건의 완료된 프로젝트가 없습니다.&quot;,
      isCollapsed: true,
      summaryText: &quot;완료된 프로젝트 목록&quot;,
      summaryColor: window.ProdigyTokens.COLORS.cyan,
      sortField: &quot;due_date&quot;,
      sortOrder: &quot;desc&quot;
    });
  }
  return false;
};
if (!run()) {
  await window.prodigyProjectReady;
  if (!run()) throw new Error(&quot;프로젝트 대시보드 렌더러가 준비되지 않았습니다.&quot;);
}
await window.__prodigyProjectLayoutAck(&quot;completed&quot;);
</code></pre>
<h2>복기 중</h2>
<pre><code class="language-dataviewjs">const run = () =&gt; {
  if (window.renderResponsiveProjectSection) {
    return window.renderResponsiveProjectSection({
      dv: dv,
      status: &quot;reviewing&quot;,
      container: this.container,
      logicalWidth: this.container.clientWidth,
      emptyMessage: &quot;해당 조건의 복기 중인 프로젝트가 없습니다.&quot;,
      isCollapsed: true,
      summaryText: &quot;복기 중인 프로젝트 목록&quot;,
      summaryColor: window.ProdigyTokens.COLORS.warning,
      sortField: &quot;due_date&quot;,
      sortOrder: &quot;desc&quot;
    });
  }
  return false;
};
if (!run()) {
  await window.prodigyProjectReady;
  if (!run()) throw new Error(&quot;프로젝트 대시보드 렌더러가 준비되지 않았습니다.&quot;);
}
await window.__prodigyProjectLayoutAck(&quot;reviewing&quot;);
</code></pre>
<h2>보관</h2>
<pre><code class="language-dataviewjs">const run = () =&gt; {
  if (window.renderResponsiveProjectSection) {
    return window.renderResponsiveProjectSection({
      dv: dv,
      status: &quot;archived&quot;,
      container: this.container,
      logicalWidth: this.container.clientWidth,
      emptyMessage: &quot;해당 조건의 보관된 프로젝트가 없습니다.&quot;,
      isCollapsed: true,
      summaryText: &quot;보관된 프로젝트 목록&quot;,
      summaryColor: &quot;var(--ke-color-muted)&quot;,
      sortField: &quot;due_date&quot;,
      sortOrder: &quot;desc&quot;
    });
  }
  return false;
};
if (!run()) {
  await window.prodigyProjectReady;
  if (!run()) throw new Error(&quot;프로젝트 대시보드 렌더러가 준비되지 않았습니다.&quot;);
}
await window.__prodigyProjectLayoutAck(&quot;archived&quot;);
</code></pre>
<pre><code>
</code></pre>
