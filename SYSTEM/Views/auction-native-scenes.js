(function (root) {
  "use strict";

  const states = new WeakMap();

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

  const resolveState = (container) => {
    const view = container?.closest?.(".markdown-preview-view");
    const app = view?.querySelector?.(".auction-native-app");
    return app ? states.get(app) : null;
  };

  const register = (kind, container) => {
    if (!container) return false;
    container.classList.add("auction-native-scene-section");
    container.setAttribute("data-native-section", kind);
    const state = resolveState(container);
    if (!state) return false;
    if (kind === "calendar") state.calendarBody.appendChild(container);
    else if (kind === "bidding") state.biddingBody.appendChild(container);
    else if (kind === "watching") state.watchingBody.appendChild(container);
    else if (kind === "today") state.detailBody.prepend(container);
    else if (kind === "pipeline") state.detailBody.appendChild(container);
    else state.reviewBody.appendChild(container);
    return true;
  };

  const mount = (options) => {
    const body = options && options.body;
    if (!body) return null;
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
    const view = app.closest?.(".markdown-preview-view");
    view?.querySelectorAll?.("[data-native-section]").forEach((container) => {
      register(container.getAttribute("data-native-section"), container);
    });
    return Object.freeze({
      element: app,
      register: (kind, container) => register(kind, container),
      focusCalendar: () => focusCalendar(state),
    });
  };

  root.ProdigyAuctionNativeScenes = Object.freeze({ mount, register });
})(typeof window !== "undefined" ? window : globalThis);
