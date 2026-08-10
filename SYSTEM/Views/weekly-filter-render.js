(function (root) {
  "use strict";

  function el(parent, tag, opts) {
    var config = opts || {};
    var element = parent.createEl ? parent.createEl(tag, config) : parent.ownerDocument.createElement(tag);
    if (!parent.createEl && parent.appendChild) {
      if (config.text !== undefined) element.textContent = String(config.text);
      Object.entries(config.attr || {}).forEach(function (e) { if (e[1] !== undefined) element.setAttribute(e[0], e[1]); });
      parent.appendChild(element);
    }
    return element;
  }

  function renderRefs(parent, refs) {
    if (!refs || !refs.length) return;
    el(parent, "span", {
      text: "근거: " + refs.join(", "),
      attr: { class: "weekly-filter-refs", style: "overflow-wrap:anywhere;word-break:break-word;" }
    });
  }

  function renderKeyLearnings(parent, learnings) {
    var section = el(parent, "section", { attr: { class: "weekly-filter-section weekly-filter-key-learnings" } });
    el(section, "h3", { text: "이번 주의 배움 (Key Learnings)", attr: { class: "weekly-filter-heading weekly-filter-heading-primary" } });
    if (!learnings || !learnings.length) {
      el(section, "p", { text: "반복 증거가 충분하지 않아 배움이 추출되지 않았다.", attr: { class: "weekly-filter-empty" } });
      return section;
    }
    for (var i = 0; i < learnings.length; i++) {
      var card = el(section, "div", { attr: { class: "weekly-filter-learning-card" } });
      el(card, "div", { attr: { class: "weekly-filter-learning-pattern" } }).createEl
        ? (function (c, l) {
            el(c, "strong", { text: "Pattern" });
            el(c, "p", { text: l.pattern || "" });
            el(c, "strong", { text: "Learning" });
            el(c, "p", { text: l.learning || "", attr: { class: "weekly-filter-learning-text" } });
            renderRefs(c, l.evidence_refs);
          })(card, learnings[i])
        : null;
    }
    return section;
  }

  function renderPatterns(parent, findings) {
    var section = el(parent, "section", { attr: { class: "weekly-filter-section" } });
    el(section, "h3", { text: "관찰된 패턴 (Observed Patterns)", attr: { class: "weekly-filter-heading" } });
    if (!findings || !findings.length) {
      el(section, "p", { text: "서로 다른 날에서 반복되는 행동 변화가 감지되지 않았다.", attr: { class: "weekly-filter-empty" } });
      return section;
    }
    for (var i = 0; i < findings.length; i++) {
      var f = findings[i];
      var card = el(section, "div", { attr: { class: "weekly-filter-pattern-card" } });
      el(card, "strong", { text: f.title || f.pattern || "" });
      if (f.learning) el(card, "p", { text: "Learning: " + f.learning, attr: { class: "weekly-filter-learning-text" } });
      renderRefs(card, f.evidence_refs);
    }
    return section;
  }

  function renderList(parent, title, items, bodyKey, className) {
    var section = el(parent, "section", { attr: { class: "weekly-filter-section" + (className ? " " + className : "") } });
    el(section, "h3", { text: title, attr: { class: "weekly-filter-heading" } });
    if (!items || !items.length) {
      el(section, "p", { text: "없음", attr: { class: "weekly-filter-empty" } });
      return section;
    }
    var list = el(section, "ul", { attr: { class: "weekly-filter-list" } });
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var li = el(list, "li", { attr: { class: "weekly-filter-item" } });
      var label = typeof item === "string" ? item : (item.title || item.statement || "");
      el(li, "strong", { text: label });
      var body = typeof item === "string" ? "" : (item[bodyKey] || item.reason || item.description || "");
      if (body && body !== label) el(li, "p", { text: body, attr: { class: "weekly-filter-body" } });
      renderRefs(li, item.evidence_refs);
    }
    return section;
  }

  function renderPrinciples(parent, principles) {
    var section = el(parent, "section", { attr: { class: "weekly-filter-section weekly-filter-principles" } });
    el(section, "h3", { text: "제안된 원칙 (Suggested Principles)", attr: { class: "weekly-filter-heading" } });
    if (!principles || !principles.length) {
      el(section, "p", { text: "반복 증거가 충분하지 않아 원칙 후보가 생성되지 않았다.", attr: { class: "weekly-filter-empty" } });
      return section;
    }
    for (var i = 0; i < principles.length; i++) {
      var p = principles[i];
      var card = el(section, "div", { attr: { class: "weekly-filter-principle-card" } });
      el(card, "strong", { text: p.title || p.statement || "원칙 후보" });
      el(card, "p", { text: p.reason || "", attr: { class: "weekly-filter-body" } });
      el(card, "span", {
        text: "Strength: " + (p.evidence_strength || "limited") + " · Status: Pending Human Review",
        attr: { class: "weekly-filter-meta", style: "overflow-wrap:anywhere;word-break:break-word;" }
      });
      renderRefs(card, p.evidence_refs);
    }
    return section;
  }

  function renderNextDirection(parent, direction) {
    var section = el(parent, "section", { attr: { class: "weekly-filter-section" } });
    el(section, "h3", { text: "다음 주 방향 (Next Week Direction)", attr: { class: "weekly-filter-heading" } });
    var hasContent = false;
    function renderGroup(label, items) {
      if (!items || !items.length) return;
      hasContent = true;
      el(section, "h4", { text: label, attr: { class: "weekly-filter-direction-label" } });
      var list = el(section, "ul", { attr: { class: "weekly-filter-list" } });
      for (var i = 0; i < items.length; i++) el(list, "li", { text: items[i] });
    }
    if (typeof direction === "object" && direction !== null && !Array.isArray(direction)) {
      renderGroup("Continue (유지)", direction.continue_items);
      renderGroup("Observe (관찰)", direction.observe_items);
      renderGroup("Increase Attention (주의)", direction.increase_attention);
      renderGroup("Pending (보류)", direction.pending_items);
    } else if (Array.isArray(direction)) {
      var list2 = el(section, "ul", { attr: { class: "weekly-filter-list" } });
      for (var j = 0; j < direction.length; j++) el(list2, "li", { text: direction[j] });
      hasContent = true;
    }
    if (!hasContent) el(section, "p", { text: "없음", attr: { class: "weekly-filter-empty" } });
    return section;
  }

  function renderLimitations(parent, limitations) {
    if (!limitations || !limitations.length) return null;
    var section = el(parent, "section", { attr: { class: "weekly-filter-section weekly-filter-limitations" } });
    el(section, "h3", { text: "한계", attr: { class: "weekly-filter-heading" } });
    var list = el(section, "ul", { attr: { class: "weekly-filter-list" } });
    for (var i = 0; i < limitations.length; i++) el(list, "li", { text: limitations[i] });
    return section;
  }

  function renderWeeklyReview(container, review) {
    container.empty();
    var wrapper = el(container, "div", { attr: { class: "weekly-filter-view", "aria-label": "주간 학습 리뷰" } });
    el(wrapper, "h2", { text: "Weekly Learning Review", attr: { class: "weekly-filter-title" } });
    var period = review.period || {};
    el(wrapper, "p", { text: (period.week || "") + " (" + (period.start || "") + " ~ " + (period.end || "") + ")", attr: { class: "weekly-filter-period" } });
    el(wrapper, "p", { text: review.question || "", attr: { class: "weekly-filter-question" } });

    var summarySection = el(wrapper, "section", { attr: { class: "weekly-filter-section" } });
    el(summarySection, "h3", { text: "요약", attr: { class: "weekly-filter-heading" } });
    el(summarySection, "p", { text: review.summary || "" });

    renderKeyLearnings(wrapper, review.key_learnings);
    renderPatterns(wrapper, review.findings);
    renderList(wrapper, "의미 있는 변화 (Meaningful Changes)", review.meaningful_changes, "reason");
    renderList(wrapper, "실험 (Experiments)", review.experiments, "description");
    renderPrinciples(wrapper, review.suggested_principles);
    renderNextDirection(wrapper, review.next_week_direction);
    renderLimitations(wrapper, review.limitations);

    if (review.references && review.references.length) {
      var refSection = el(wrapper, "details", { attr: { class: "weekly-filter-section weekly-filter-evidence" } });
      if (typeof window !== "undefined" && window.innerWidth > 600) refSection.open = true;
      el(refSection, "summary", { text: "Evidence References", attr: { class: "weekly-filter-heading" } });
      var refList = el(refSection, "ul", { attr: { class: "weekly-filter-list" } });
      for (var i = 0; i < review.references.length; i++) el(refList, "li", { text: review.references[i] });
    }
    return wrapper;
  }

  var api = Object.freeze({ renderWeeklyReview: renderWeeklyReview });
  root.WeeklyFilterRender = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
