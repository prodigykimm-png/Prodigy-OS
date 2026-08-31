(function (root) {
  "use strict";

  const VERSION = "prodigy_wiki_controller_v1";
  const HASH = /^[0-9a-f]{64}$/u;
  const STATES = Object.freeze([
    "idle",
    "source_selected",
    "range_required",
    "consent_required",
    "running",
    "review_ready",
    "interrupted",
    "source_changed",
  ]);
  const DURABLE_STATES = Object.freeze(new Set(["running", "review_ready", "interrupted", "source_changed"]));

  function plain(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }
  function freeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
    return value;
  }
  function copy(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }
  function validSource(source) {
    return plain(source)
      && typeof source.path === "string" && source.path.length > 0
      && typeof source.title === "string" && source.title.length > 0
      && HASH.test(source.content_hash || "");
  }
  function validRange(range) {
    return plain(range)
      && typeof (range.range_id || range.scope_id) === "string"
      && Number.isSafeInteger(range.start) && Number.isSafeInteger(range.end)
      && range.start >= 0 && range.end > range.start;
  }
  function baseSnapshot() {
    return {
      version: VERSION,
      status: "idle",
      picker_open: false,
      source: null,
      range: null,
      options: [],
      stage: "",
      result: null,
      reason: "",
      resumable: false,
      operation_id: "",
    };
  }
  function initialSnapshot(value) {
    if (!plain(value) || value.durable !== true || !DURABLE_STATES.has(value.status) || !validSource(value.source)) {
      return freeze(baseSnapshot());
    }
    return freeze({
      ...baseSnapshot(),
      status: value.status,
      source: copy(value.source),
      range: validRange(value.range) ? copy(value.range) : null,
      stage: typeof value.stage === "string" ? value.stage : "",
      result: plain(value.result) ? copy(value.result) : null,
      reason: typeof value.reason === "string" ? value.reason : "",
      resumable: value.resumable === true,
      operation_id: typeof value.operation_id === "string" ? value.operation_id : "",
    });
  }

  function createController(options = {}) {
    let snapshot = initialSnapshot(options.initialSnapshot);
    const subscribers = new Set();

    function notify() {
      for (const subscriber of [...subscribers]) subscriber(snapshot);
    }
    function replace(next) {
      snapshot = freeze({ ...baseSnapshot(), ...next, version: VERSION });
      notify();
      return freeze({ ok: true, status: snapshot.status, snapshot });
    }
    function reject(reason) {
      return freeze({ ok: false, reason });
    }
    function dispatch(event) {
      if (!plain(event) || typeof event.type !== "string") return reject("invalid_event");
      if (event.type === "open_picker") {
        return replace({
          status: "idle",
          picker_open: true,
          options: Array.isArray(event.options) ? copy(event.options) : [],
        });
      }
      if (event.type === "set_options") {
        return replace({ ...snapshot, options: Array.isArray(event.options) ? copy(event.options) : [] });
      }
      if (event.type === "select_source") {
        if (!validSource(event.source)) return reject("invalid_source");
        return replace({
          status: "source_selected",
          source: copy(event.source),
          options: snapshot.options,
        });
      }
      if (event.type === "require_range") {
        if (!validSource(snapshot.source)) return reject("source_required");
        return replace({
          status: "range_required",
          source: snapshot.source,
          result: plain(event.result) ? copy(event.result) : null,
          options: snapshot.options,
          reason: typeof event.reason === "string" ? event.reason : "large_source_range_required",
        });
      }
      if (event.type === "select_range") {
        if (!validSource(snapshot.source)) return reject("source_required");
        if (!validRange(event.range)) return reject("invalid_range");
        return replace({
          status: "source_selected",
          source: snapshot.source,
          range: copy(event.range),
          result: plain(event.preflight) ? copy(event.preflight) : null,
          options: snapshot.options,
        });
      }
      if (event.type === "request_consent") {
        if (!validSource(snapshot.source)) return reject("source_required");
        return replace({
          status: "consent_required",
          source: snapshot.source,
          range: snapshot.range,
          result: plain(event.preflight) ? copy(event.preflight) : snapshot.result,
          options: snapshot.options,
          stage: "preflight",
        });
      }
      if (event.type === "start") {
        if (!validSource(snapshot.source)) return reject("source_required");
        if (snapshot.status !== "consent_required") return reject("consent_required");
        return replace({
          status: "running",
          source: snapshot.source,
          range: snapshot.range,
          result: snapshot.result,
          options: snapshot.options,
          stage: typeof event.stage === "string" ? event.stage : "preflight",
          operation_id: typeof event.operation_id === "string" ? event.operation_id : "",
        });
      }
      if (event.type === "progress") {
        if (snapshot.status !== "running") return reject("run_not_active");
        return replace({
          ...snapshot,
          stage: typeof event.stage === "string" ? event.stage : snapshot.stage,
        });
      }
      if (event.type === "complete") {
        if (!validSource(snapshot.source)) return reject("source_required");
        return replace({
          status: "review_ready",
          source: snapshot.source,
          range: snapshot.range,
          result: plain(event.result) ? copy(event.result) : null,
          options: snapshot.options,
          stage: "complete",
          operation_id: snapshot.operation_id,
        });
      }
      if (event.type === "interrupt") {
        return replace({
          status: "interrupted",
          source: snapshot.source,
          range: snapshot.range,
          result: plain(event.result) ? copy(event.result) : snapshot.result,
          options: snapshot.options,
          stage: typeof event.stage === "string" ? event.stage : snapshot.stage,
          reason: typeof event.reason === "string" ? event.reason : "operation_interrupted",
          resumable: event.resumable === true,
          operation_id: snapshot.operation_id,
        });
      }
      if (event.type === "source_changed") {
        if (!validSource(snapshot.source)) return reject("source_required");
        return replace({
          status: "source_changed",
          source: snapshot.source,
          range: snapshot.range,
          options: snapshot.options,
          reason: "source_revision_changed",
          operation_id: snapshot.operation_id,
        });
      }
      if (event.type === "cancel") {
        if (!validSource(snapshot.source)) return replace({ status: "idle", options: snapshot.options });
        return replace({
          status: "source_selected",
          source: snapshot.source,
          range: snapshot.range,
          options: snapshot.options,
        });
      }
      if (event.type === "reset") return replace({ status: "idle", options: snapshot.options });
      return reject("unknown_event");
    }

    return freeze({
      dispatch,
      getSnapshot() { return snapshot; },
      subscribe(subscriber) {
        if (typeof subscriber !== "function") throw new TypeError("subscriber_required");
        subscribers.add(subscriber);
        subscriber(snapshot);
        return () => subscribers.delete(subscriber);
      },
      subscriberCount() { return subscribers.size; },
    });
  }

  function projectLifecycle(snapshot) {
    const value = plain(snapshot) ? snapshot : baseSnapshot();
    const status = value.status === "idle"
      ? value.picker_open ? "selecting" : "idle"
      : value.status === "source_selected" || value.status === "range_required" ? "selecting"
        : value.status === "review_ready" ? "complete"
          : value.status === "interrupted" || value.status === "source_changed" ? "failed"
            : value.status;
    const goldenStatus = ({
      idle: "idle",
      source_selected: "ready",
      range_required: "scope_required",
      consent_required: "consent_required",
      running: "running",
      review_ready: "complete",
      interrupted: "failed",
      source_changed: "failed",
    })[value.status] || "idle";
    const sourceSelection = validSource(value.source) ? {
      selected: true,
      display_name: value.source.title,
      source_path: value.source.path,
      content_hash: value.source.content_hash,
      source_kind: value.source.source_kind || "literature",
      provider_mode: value.source.source_kind === "inbox" ? "direct" : value.source.provider_mode || "direct",
    } : null;
    return freeze({
      status,
      source_selection: sourceSelection,
      source_options: copy(value.options || []),
      golden_wiki: {
        status: goldenStatus,
        stage: value.stage,
        result: value.result,
        reason: value.reason,
        scope: value.range,
      },
      reason: value.reason,
    });
  }

  function deriveViewModel(snapshot) {
    const value = plain(snapshot) && STATES.includes(snapshot.status)
      ? snapshot : baseSnapshot();
    const primaryAction = ({
      idle: "select_source",
      source_selected: "request_consent",
      range_required: "select_range",
      consent_required: "start_run",
      running: null,
      review_ready: "open_review",
      interrupted: value.resumable === true ? "resume" : "retry",
      source_changed: "reset_source",
    })[value.status];
    const copyByState = {
      idle: {
        title: "정리할 자료를 선택하세요",
        description: value.picker_open ? "내 자료에서 Prodigy Wiki로 만들 항목을 고르세요." : "자료를 선택하면 원문은 바꾸지 않고 읽기 좋은 문서로 정리합니다.",
        primary_label: "자료 선택",
      },
      source_selected: {
        title: "이 자료를 정리할까요?",
        description: "선택한 자료와 정리 범위를 확인한 뒤 시작하세요.",
        primary_label: "Prodigy Wiki 만들기",
      },
      range_required: {
        title: "먼저 정리할 부분을 선택하세요",
        description: "자료가 커서 한 번에 정리할 수 없습니다.",
        primary_label: "범위 선택 완료",
      },
      consent_required: {
        title: "외부 AI 전송 동의가 필요합니다",
        description: "선택한 원문만 전송하며 원문과 정식 지식 문서는 변경하지 않습니다.",
        primary_label: "동의하고 만들기",
      },
      running: {
        title: "Prodigy Wiki를 만들고 있습니다",
        description: "원문을 읽기 좋은 문서로 정리하고 자동 검사를 진행합니다.",
        primary_label: "",
      },
      review_ready: {
        title: "정리 결과가 준비되었습니다",
        description: "결과와 원문을 함께 확인해 주세요.",
        primary_label: "검토하기",
      },
      interrupted: {
        title: "작업을 완료하지 못했습니다",
        description: value.resumable === true ? "완료된 단계부터 이어서 진행할 수 있습니다." : "원문은 변경되지 않았습니다.",
        primary_label: value.resumable === true ? "이어서 하기" : "다시 만들기",
      },
      source_changed: {
        title: "선택 이후 원문이 변경되었습니다",
        description: "현재 원문을 기준으로 다시 준비해야 합니다.",
        primary_label: "새 내용으로 다시 준비",
      },
    };
    const copy = copyByState[value.status] || copyByState.idle;
    return freeze({
      product_id: "prodigy-wiki",
      state: value.status,
      primary_action: primaryAction,
      title: copy.title,
      description: copy.description,
      primary_label: copy.primary_label,
      busy: value.status === "running",
      requires_human_review: value.status === "review_ready",
      technical_details_collapsed: true,
    });
  }

  const api = freeze({
    VERSION,
    STATES,
    createController,
    deriveViewModel,
    projectLifecycle,
  });
  root.ProdigyWikiController = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
