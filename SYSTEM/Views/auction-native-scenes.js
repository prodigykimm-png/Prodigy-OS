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
  const MEMO_PATH = "PARA/PROJECTS/Auction/옥션 워크스페이스 메모.md";

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

  const readMemo = async (app) => {
    const file = app?.vault?.getAbstractFileByPath?.(MEMO_PATH);
    if (!file) return "";
    if (typeof app.vault.cachedRead === "function") return app.vault.cachedRead(file);
    return app.vault.read(file);
  };

  const writeMemo = async (app, content) => {
    const text = String(content ?? "");
    const file = app?.vault?.getAbstractFileByPath?.(MEMO_PATH);
    if (file) {
      await app.vault.modify(file, text);
      return file;
    }
    return app.vault.create(MEMO_PATH, text);
  };

  const mountMemo = (parent, app, scope) => {
    const memo = create(parent, "section", "auction-native-memo");
    const header = create(memo, "header", "auction-native-memo-header");
    const titleGroup = create(header, "div", "auction-native-memo-title-group");
    const icon = create(titleGroup, "span", "auction-native-memo-icon");
    icon.setAttribute("aria-hidden", "true");
    create(titleGroup, "span", "auction-native-memo-title", "빠른 메모");
    const status = create(header, "span", "auction-native-memo-status", "불러오는 중");
    status.setAttribute("aria-live", "polite");
    const textarea = create(memo, "textarea", "auction-native-memo-input");
    textarea.setAttribute("aria-label", "옥션 빠른 메모");
    textarea.setAttribute("placeholder", "오늘 확인할 물건, 입찰 전략, 준비할 일을 적어보세요.");
    textarea.setAttribute("spellcheck", "true");

    let lastSaved = "";
    let touched = false;
    let timer = null;
    let queue = Promise.resolve();
    const clearTimer = () => {
      if (timer === null) return;
      if (scope && typeof scope.clearTimeout === "function") scope.clearTimeout(timer);
      else root.clearTimeout(timer);
      timer = null;
    };
    const setStatus = (message, tone = "") => {
      status.textContent = message;
      status.setAttribute("data-tone", tone);
    };

    const ready = readMemo(app)
      .then((content) => {
        lastSaved = String(content ?? "");
        if (!touched) textarea.value = lastSaved;
        setStatus("자동 저장");
        return lastSaved;
      })
      .catch((error) => {
        setStatus("불러오기 실패", "error");
        root.console?.error?.("옥션 워크스페이스 메모를 불러오지 못했습니다.", error);
        return "";
      });

    const flush = () => {
      clearTimer();
      const value = textarea.value;
      queue = queue
        .catch(() => undefined)
        .then(() => ready)
        .then(async () => {
          if (value === lastSaved) {
            setStatus("자동 저장");
            return value;
          }
          setStatus("저장 중");
          await writeMemo(app, value);
          lastSaved = value;
          setStatus(textarea.value === value ? "저장됨" : "입력 중");
          return value;
        })
        .catch((error) => {
          setStatus("저장 실패", "error");
          root.console?.error?.("옥션 워크스페이스 메모를 저장하지 못했습니다.", error);
          throw error;
        });
      return queue;
    };

    const scheduleSave = () => {
      touched = true;
      clearTimer();
      setStatus("입력 중");
      const callback = () => {
        timer = null;
        void flush();
      };
      timer = scope && typeof scope.timeout === "function"
        ? scope.timeout(callback, 420)
        : root.setTimeout(callback, 420);
    };

    textarea.addEventListener("input", scheduleSave);
    textarea.addEventListener("blur", () => {
      void flush();
    });
    if (scope && typeof scope.track === "function") {
      scope.track(() => {
        clearTimer();
        if (textarea.value !== lastSaved) void flush();
      });
    }

    return Object.freeze({ element: memo, textarea, status, ready, flush });
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
    if (kind === "filters") state.filterBody.appendChild(container);
    else if (kind === "calendar") state.calendarBody.appendChild(container);
    else if (kind === "bidding") state.biddingBody.appendChild(container);
    else if (kind === "watching") state.watchingBody.appendChild(container);
    else if (kind === "today") state.detailBody.prepend(container);
    else if (kind === "pipeline") state.detailBody.appendChild(container);
    else state.reviewBody.appendChild(container);
    return true;
  };

  const notifySectionConnected = (kind, container) => {
    if (!container || typeof container.dispatchEvent !== "function") return;
    const view = container.ownerDocument?.defaultView || root;
    const EventConstructor = view?.CustomEvent || root.CustomEvent;
    const detail = { kind };
    const event = typeof EventConstructor === "function"
      ? new EventConstructor("prodigy-auction-section-connected", { detail })
      : { type: "prodigy-auction-section-connected", detail };
    container.dispatchEvent(event);
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
    const placed = placeSection(state, kind, container);
    if (placed) notifySectionConnected(kind, container);
    return placed;
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
    const memo = mountMemo(
      detailBody,
      options.app || root.app,
      options.mountScope || null
    );
    const calendarPane = create(overview, "section", "auction-native-calendar-pane");
    const calendarHeading = create(calendarPane, "h2", "auction-native-pane-title", "입찰 달력");
    calendarHeading.tabIndex = -1;
    const calendarBody = create(calendarPane, "div", "auction-native-calendar-body");
    const workPane = create(home, "section", "auction-native-work-pane");
    const workHeading = create(workPane, "h2", "auction-native-pane-title", "오늘의 물건");
    workHeading.tabIndex = -1;
    const filterBody = create(workPane, "div", "auction-native-filter-body");
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
      filterBody,
      biddingBody,
      watchingBody,
      reviewBody,
      calendarBody,
      memo,
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
      memo,
    });
    bodyControllers.set(body, controller);
    return controller;
  };

  const api = Object.freeze({ MEMO_PATH, readMemo, writeMemo, mount, register });
  root.ProdigyAuctionNativeScenes = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
