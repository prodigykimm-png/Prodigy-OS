(function (root) {
  "use strict";

  const runtime = root.__prodigyAuctionNativeScenesRuntime || {
    states: new WeakMap(),
    viewStates: new WeakMap(),
    bodyControllers: new WeakMap(),
    sectionRegistries: new WeakMap(),
    pendingRegistrations: new WeakMap(),
  };
  root.__prodigyAuctionNativeScenesRuntime = runtime;
  const states = runtime.states;
  const viewStates = runtime.viewStates;
  const bodyControllers = runtime.bodyControllers;
  const sectionRegistries = runtime.sectionRegistries;
  const pendingRegistrations = runtime.pendingRegistrations || new WeakMap();
  runtime.pendingRegistrations = pendingRegistrations;

  const create = (parent, tag, className, text) => {
    const element = parent.createEl
      ? parent.createEl(tag, { text, attr: { class: className } })
      : document.createElement(tag);
    if (!parent.createEl) {
      element.className = className;
      if (text) element.textContent = text;
      parent.appendChild(element);
    }
    return element;
  };

  const createWorkGroup = (parent, label) => {
    const group = create(parent, "details", "auction-native-work-group");
    group.open = true;
    create(group, "summary", "auction-native-work-group-title", label);
    return create(group, "div", "auction-native-work-group-body");
  };

  const focusCalendar = (state) => {
    if (!state?.calendarHeading) return false;
    state.calendarHeading.focus?.({ preventScroll: true });
    state.calendarPane.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    return true;
  };

  const viewFor = (container) => container?.closest?.(".markdown-preview-view") || null;

  const registryFor = (view) => {
    if (!view) return null;
    let registry = sectionRegistries.get(view);
    if (!registry) {
      registry = new Map();
      sectionRegistries.set(view, registry);
    }
    return registry;
  };

  const rememberSection = (view, kind, container) => {
    const registry = registryFor(view);
    if (!registry) return null;
    const prior = registry.get(kind);
    if (prior && prior !== container) {
      if (typeof prior.remove === "function") prior.remove();
      else if (prior.parentElement && typeof prior.parentElement.removeChild === "function") prior.parentElement.removeChild(prior);
    }
    registry.set(kind, container);
    return registry;
  };

  const placeSection = (state, kind, container) => {
    if (!state || !container) return false;
    if (kind === "calendar") state.calendarBody.appendChild(container);
    else if (kind === "bidding") state.biddingBody.appendChild(container);
    else if (kind === "watching") state.watchingBody.appendChild(container);
    else if (kind === "today") state.detailBody.prepend(container);
    else if (kind === "pipeline") state.detailBody.appendChild(container);
    else state.reviewBody.appendChild(container);
    return true;
  };

  const resolveState = (container) => {
    const view = viewFor(container);
    const registered = view && viewStates.get(view);
    if (registered) return registered;
    const app = view?.querySelector?.(".auction-native-app");
    return app ? states.get(app) : null;
  };

  const deferRegistrationUntilConnected = (kind, container) => {
    const existing = pendingRegistrations.get(container);
    if (existing) {
      existing.kind = kind;
      return false;
    }
    const Observer = root.MutationObserver;
    const ownerDocument = container.ownerDocument || root.document;
    const observationRoot = ownerDocument && (ownerDocument.body || ownerDocument.documentElement);
    if (typeof Observer !== "function" || !observationRoot) return false;
    const pending = { kind, observer: null };
    const settle = () => {
      const current = pendingRegistrations.get(container);
      if (!current || !viewFor(container)) return false;
      current.observer.disconnect();
      pendingRegistrations.delete(container);
      register(current.kind, container);
      return true;
    };
    pending.observer = new Observer(settle);
    pendingRegistrations.set(container, pending);
    pending.observer.observe(observationRoot, { childList: true, subtree: true });
    settle();
    return false;
  };

  const register = (kind, container) => {
    if (!container) return false;
    container.classList.add("auction-native-scene-section");
    container.setAttribute("data-native-section", kind);
    const view = viewFor(container);
    if (!view) return deferRegistrationUntilConnected(kind, container);
    const pending = pendingRegistrations.get(container);
    if (pending) {
      pending.observer.disconnect();
      pendingRegistrations.delete(container);
    }
    rememberSection(view, kind, container);
    const state = resolveState(container);
    if (!state) return false;
    return placeSection(state, kind, container);
  };

  const mount = (options) => {
    const body = options && options.body;
    if (!body) return null;
    const existing = bodyControllers.get(body);
    const existingConnected = existing && existing.element && (
      typeof body.contains === "function"
        ? body.contains(existing.element)
        : existing.element.parentElement === body
    );
    if (existingConnected) return existing;

    const view = viewFor(body);
    body.empty?.();
    const app = create(body, "div", "auction-native-app");

    const home = create(app, "section", "auction-native-scene auction-native-home");
    const overview = create(home, "div", "auction-native-overview");
    const detailPane = create(overview, "section", "auction-native-detail-pane");
    const homeHeading = create(detailPane, "h2", "auction-native-pane-title", "주요 브리핑");
    homeHeading.tabIndex = -1;
    const detailBody = create(detailPane, "div", "auction-native-detail-body");
    const calendarPane = create(overview, "section", "auction-native-calendar-pane");
    const calendarHeading = create(calendarPane, "h2", "auction-native-pane-title", "입찰 달력");
    calendarHeading.tabIndex = -1;
    const calendarBody = create(calendarPane, "div", "auction-native-calendar-body");
    const workPane = create(home, "section", "auction-native-work-pane");
    const workHeading = create(workPane, "h2", "auction-native-pane-title", "오늘의 물건");
    workHeading.tabIndex = -1;
    const workBody = create(workPane, "div", "auction-native-work-body");
    const biddingBody = createWorkGroup(workBody, "입찰 예정");
    biddingBody.classList.add("auction-native-list-body");
    const watchingBody = createWorkGroup(workBody, "관심");
    watchingBody.classList.add("auction-native-list-body");
    const reviewBody = createWorkGroup(workBody, "복기");
    reviewBody.classList.add("auction-native-support-body");

    const state = {
      app,
      home,
      homeHeading,
      calendarHeading,
      calendarPane,
      detailBody,
      biddingBody,
      watchingBody,
      reviewBody,
      calendarBody,
    };
    states.set(app, state);
    if (view) viewStates.set(view, state);
    view?.querySelectorAll?.("[data-native-section]").forEach((container) => {
      if (viewFor(container) !== view) return;
      const kind = container.getAttribute("data-native-section");
      if (kind) rememberSection(view, kind, container);
    });
    const registry = registryFor(view);
    if (registry) {
      registry.forEach((container, kind) => {
        placeSection(state, kind, container);
      });
    }
    const controller = Object.freeze({
      element: app,
      register: (kind, container) => register(kind, container),
      focusCalendar: () => focusCalendar(state),
    });
    bodyControllers.set(body, controller);
    return controller;
  };

  root.ProdigyAuctionNativeScenes = Object.freeze({ mount, register });
})(typeof window !== "undefined" ? window : globalThis);
