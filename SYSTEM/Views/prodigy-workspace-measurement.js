(function (root) {
  "use strict";

  var nextSession = 1;
  var campaignRegistry = Object.create(null);

  function resolve(name, relativePath) {
    if (root && root[name]) return root[name];
    if (typeof require === "function") {
      try { return require(relativePath); } catch (_error) { return null; }
    }
    return null;
  }

  function own(value, key) {
    return !!value && Object.prototype.hasOwnProperty.call(value, key);
  }

  function text(value, fallback) {
    var result = String(value === undefined || value === null ? "" : value).trim();
    return result || fallback;
  }

  function safeId(value, fallback) {
    var result = text(value, fallback).replace(/[^A-Za-z0-9._-]+/g, "-");
    return result.slice(0, 128) || fallback;
  }

  function validSha256(value) {
    return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
  }

  function validFinalSha(value) {
    return typeof value === "string" && /^[a-f0-9]{40,64}$/.test(value);
  }

  function bindingError(options) {
    if (!options || typeof options !== "object" || Array.isArray(options)) return "invalid_receipt_options";
    if (options.cold_warm !== "cold" && options.cold_warm !== "warm") return "missing_cold_warm";
    if (!own(options, "source_sha256")) return "missing_source_sha256";
    if (!validSha256(options.source_sha256)) return "invalid_source_sha256";
    if (!own(options, "settings_sha256")) return "missing_settings_sha256";
    if (!validSha256(options.settings_sha256)) return "invalid_settings_sha256";
    if (!own(options, "final_git_sha")) return "missing_final_git_sha";
    if (!validFinalSha(options.final_git_sha)) return "invalid_final_git_sha";
    return null;
  }

  function receiptOptions(options) {
    var value = options && typeof options === "object" && !Array.isArray(options) ? Object.assign({}, options) : {};
    var code = bindingError(value);
    if (code) {
      var failure = new Error(code);
      failure.code = code;
      throw failure;
    }
    return value;
  }

  function noMeasurement(reason) {
    var session = {
      available: false,
      reason: reason || "measurement_unavailable",
      exporterAvailable: false,
      mark: function () { return null; },
      record: function () { return null; },
      start: function () { return null; },
      end: function () { return null; },
      measure: function (_phase, operation) { return typeof operation === "function" ? operation() : undefined; },
      retry: function () { return null; },
      fail: function () { return null; },
      readiness: function () { return null; },
      measureModule: function (_path, operation) { return typeof operation === "function" ? operation() : undefined; },
      markReady: function () { return null; },
      recordMissing: function () { return null; },
      finalize: function () { return null; },
      previewExport: function () { return null; },
      createExporter: function () { return null; },
      dispose: function () { return null; },
      preview: function () { return null; },
      confirm: function () { return null; },
      save: function () { return null; },
      pendingReceipt: function () { return null; },
      state: function () { return "unavailable"; },
      get redactedPreview() { return null; }
    };
    session.controller = unavailableController(reason || "measurement_unavailable", session);
    session.campaign = session.controller;
    return Object.freeze(session);
  }

  function unavailableController(reason, session) {
    var controller = {
      available: false,
      reason: reason || "measurement_unavailable",
      exporterAvailable: false,
      session: session || null,
      exporter: null,
      mark: function () { return null; },
      record: function () { return null; },
      start: function () { return null; },
      end: function () { return null; },
      measure: function (_phase, operation) { return typeof operation === "function" ? operation() : undefined; },
      retry: function () { return null; },
      fail: function () { return null; },
      readiness: function () { return null; },
      measureModule: function (_path, operation) { return typeof operation === "function" ? operation() : undefined; },
      markReady: function () { return null; },
      recordMissing: function () { return null; },
      finalize: function () { return null; },
      preview: function () { return null; },
      previewExport: function () { return null; },
      createExporter: function () { return null; },
      confirm: function () { return null; },
      save: function () { return null; },
      pendingReceipt: function () { return null; },
      state: function () { return "unavailable"; },
      dispose: function () { return null; },
      get redactedPreview() { return null; }
    };
    return Object.freeze(controller);
  }

  function createController(session, config) {
    var ExporterApi = resolve("ProdigyPerformanceExporter", "./prodigy-performance-exporter.js");
    var available = !!(session && session.available === true
      && ExporterApi
      && typeof ExporterApi.createExporter === "function");
    if (!available) {
      return unavailableController(
        session && session.available !== true ? (session.reason || "measurement_unavailable") : "exporter_unavailable",
        session
      );
    }

    var exporter = null;
    var lastReceipt = null;
    var lastPreview = null;
    var options = config && typeof config === "object" ? config : {};

    function exportValue(value) {
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    }

    function ensureExporter(exportOptions, receipt) {
      if (exporter) return exporter;
      var value = exportValue(exportOptions);
      try {
        exporter = ExporterApi.createExporter(Object.assign({}, value, { receipt: receipt }));
      } catch (_error) {
        exporter = null;
      }
      return exporter;
    }

    function finalize(receiptInput) {
      var value = receiptOptions(receiptInput);
      var receipt = session.finalize(value);
      lastReceipt = receipt;
      if (ExporterApi && typeof ExporterApi.prepareExportReceipt === "function") {
        try { lastPreview = ExporterApi.prepareExportReceipt(receipt); } catch (_error) { lastPreview = null; }
      }
      return receipt;
    }

    function splitPreviewOptions(input) {
      var value = exportValue(input);
      var receiptInput = own(value, "receiptOptions") ? value.receiptOptions : value;
      var exportInput = own(value, "exportOptions") ? value.exportOptions : value;
      return { receipt: receiptInput, exportOptions: exportInput };
    }

    function preview(input) {
      var split = splitPreviewOptions(input);
      var receipt = finalize(split.receipt);
      var instance = ensureExporter(split.exportOptions, receipt);
      if (!instance || typeof instance.preview !== "function") return null;
      return instance.preview();
    }

    function createExporter(exportInput) {
      var value = exportValue(exportInput);
      var receipt = own(value, "receipt") ? value.receipt : lastReceipt;
      if (!receipt) {
        receipt = finalize(own(value, "receiptOptions") ? value.receiptOptions : value);
      }
      return ensureExporter(value, receipt);
    }

    function confirm(confirmation) {
      return exporter && typeof exporter.confirm === "function" ? exporter.confirm(confirmation) : null;
    }

    function save() {
      return exporter && typeof exporter.save === "function" ? exporter.save() : null;
    }

    function retryExport() {
      return exporter && typeof exporter.retry === "function" ? exporter.retry() : null;
    }

    function pendingReceipt() {
      return exporter && typeof exporter.pendingReceipt === "function" ? exporter.pendingReceipt() : null;
    }

    function state() {
      return exporter && typeof exporter.state === "function" ? exporter.state() : "pending";
    }

    var controller = {
      available: true,
      reason: null,
      exporterAvailable: true,
      workspaceId: session.workspaceId,
      runId: session.runId,
      correlationId: session.correlationId,
      mountId: session.mountId,
      session: session,
      get exporter() { return exporter; },
      mark: function (phase, fields) { return session.mark(phase, fields); },
      record: function (phase, fields) { return session.record(phase, fields); },
      start: function (phase, fields) { return session.start(phase, fields); },
      end: function (tokenOrPhase, fields) { return session.end(tokenOrPhase, fields); },
      measure: function (phase, operation, fields) { return session.measure(phase, operation, fields); },
      retry: function (fields) {
        if (arguments.length > 0 && fields !== undefined && !exporter) return session.retry(fields);
        return retryExport();
      },
      fail: function (error, fields) { return session.fail(error, fields); },
      readiness: function (selector, snapshot, readinessOptions) { return session.readiness(selector, snapshot, readinessOptions); },
      markReady: function (selector, snapshot, readinessOptions) { return session.markReady(selector, snapshot, readinessOptions); },
      measureModule: function (modulePath, operation) { return session.measureModule(modulePath, operation); },
      recordMissing: function (phase) { return session.recordMissing(phase); },
      finalize: finalize,
      preview: preview,
      previewExport: preview,
      createExporter: createExporter,
      confirm: confirm,
      save: save,
      retryExport: retryExport,
      pendingReceipt: pendingReceipt,
      state: state,
      dispose: function (fields) { return session.dispose(fields); },
      get redactedPreview() { return session.redactedPreview || lastPreview; },
      get disposed() { return !!session.disposed; },
      get options() { return options; }
    };
    return Object.freeze(controller);
  }

  function createSession(options) {
    var config = options && typeof options === "object" ? options : {};
    var RecorderApi = resolve("ProdigyPerformanceRecorder", "./prodigy-performance-recorder.js");
    if (!RecorderApi || typeof RecorderApi.createRecorder !== "function") return noMeasurement("recorder_unavailable");

    var workspaceId = safeId(config.workspace_id || config.workspaceId, "workspace");
    var sequence = nextSession++;
    var runId = safeId(config.run_id || config.runId, "workspace-" + workspaceId + "-" + sequence);
    var correlationId = safeId(config.correlation_id || config.correlationId, "workspace-" + workspaceId);
    var mountId = safeId(config.mount_id || config.mountId, "mount-" + workspaceId + "-" + sequence);
    var recorder;
    try {
      recorder = RecorderApi.createRecorder({
        run_id: runId,
        correlation_id: correlationId,
        mount_id: mountId,
        workspace_id: workspaceId,
        module_path: "SYSTEM/Views/prodigy-workspace-measurement.js",
        clock: config.clock,
        performance: config.performance,
        correlation_started_at_ms: config.correlation_started_at_ms,
        instrumented: config.instrumented !== false,
        cold_warm: config.cold_warm,
        source_sha256: config.source_sha256,
        settings_sha256: config.settings_sha256,
        configuration_sha256: config.configuration_sha256,
        campaign_id: config.campaign_id,
        external_start_status: config.external_start_status,
        external_start_duration_ms: config.external_start_duration_ms,
        icloud_status: config.icloud_status
      });
    } catch (error) {
      return noMeasurement(error && error.code ? error.code : "recorder_create_failed");
    }

    var lastExportPreview = null;
    var disposedMarked = false;
    var disposedReceipt = null;
    var controller = null;

    function call(method, args) {
      if (!recorder || typeof recorder[method] !== "function") return null;
      try { return recorder[method].apply(recorder, args || []); } catch (_error) { return null; }
    }

    function strictCall(method, args) {
      if (!recorder || typeof recorder[method] !== "function") return null;
      return recorder[method].apply(recorder, args || []);
    }

    function measureModule(modulePath, operation) {
      var token = call("start", ["module", { module_path: modulePath, status: "evaluating" }]);
      try {
        var result = typeof operation === "function" ? operation() : undefined;
        if (result && typeof result.then === "function") {
          return result.then(function (value) {
            call("end", [token, { module_path: modulePath, status: "loaded" }]);
            return value;
          }, function (error) {
            call("recordFailure", [error, { phase: "module" }]);
            call("end", [token, { module_path: modulePath, status: "failed" }]);
            throw error;
          });
        }
        call("end", [token, { module_path: modulePath, status: "loaded" }]);
        return result;
      } catch (error) {
        call("recordFailure", [error, { phase: "module" }]);
        call("end", [token, { module_path: modulePath, status: "failed" }]);
        throw error;
      }
    }

    function readiness(selector, snapshot, readinessOptions) {
      var ReadinessApi = resolve("ProdigyWorkspaceReadiness", "./prodigy-workspace-readiness.js");
      if (!ReadinessApi || typeof ReadinessApi.evaluateReadiness !== "function") return null;
      try { return ReadinessApi.evaluateReadiness(selector, snapshot, readinessOptions); } catch (_error) { return null; }
    }

    function markReady(selector, snapshot, readinessOptions) {
      var result = readiness(selector, snapshot, readinessOptions);
      if (result && result.ready === true) {
        call("mark", ["primary_action_ready", {
          scope: result.selector || selector,
          status: result.status,
          code: result.reasonCode
        }]);
      }
      return result;
    }

    function finalize(receiptInput) {
      var optionsValue = receiptOptions(receiptInput);
      var receipt = strictCall("finalize", [optionsValue]);
      var ExporterApi = resolve("ProdigyPerformanceExporter", "./prodigy-performance-exporter.js");
      if (receipt && ExporterApi && typeof ExporterApi.prepareExportReceipt === "function") {
        try { lastExportPreview = ExporterApi.prepareExportReceipt(receipt); } catch (_error) { lastExportPreview = null; }
      }
      return receipt;
    }

    function dispose(fields) {
      var optionsValue = fields && typeof fields === "object" && !Array.isArray(fields) ? fields : {};
      var valid = !bindingError(optionsValue);
      if (disposedReceipt) return disposedReceipt;
      if (!disposedMarked) {
        if (valid) {
          disposedReceipt = strictCall("dispose", [receiptOptions(optionsValue)]);
          disposedMarked = true;
          var ExporterApi = resolve("ProdigyPerformanceExporter", "./prodigy-performance-exporter.js");
          if (disposedReceipt && ExporterApi && typeof ExporterApi.prepareExportReceipt === "function") {
            try { lastExportPreview = ExporterApi.prepareExportReceipt(disposedReceipt); } catch (_error) { lastExportPreview = null; }
          }
          return disposedReceipt;
        }
        call("mark", ["disposed", {}]);
        disposedMarked = true;
        return null;
      }
      if (valid) {
        disposedReceipt = strictCall("finalize", [receiptOptions(optionsValue)]);
        var FinalExporterApi = resolve("ProdigyPerformanceExporter", "./prodigy-performance-exporter.js");
        if (disposedReceipt && FinalExporterApi && typeof FinalExporterApi.prepareExportReceipt === "function") {
          try { lastExportPreview = FinalExporterApi.prepareExportReceipt(disposedReceipt); } catch (_error) { lastExportPreview = null; }
        }
        return disposedReceipt;
      }
      return null;
    }

    var session = {
      available: true,
      workspaceId: workspaceId,
      runId: runId,
      correlationId: correlationId,
      mountId: mountId,
      recorder: recorder,
      mark: function (phase, fields) { return call("mark", [phase, fields]); },
      record: function (phase, fields) { return call("record", [phase, fields]); },
      start: function (phase, fields) { return call("start", [phase, fields]); },
      end: function (tokenOrPhase, fields) { return call("end", [tokenOrPhase, fields]); },
      measure: function (phase, operation, fields) {
        if (!recorder || typeof recorder.measure !== "function") return typeof operation === "function" ? operation() : undefined;
        return recorder.measure(phase, operation, fields);
      },
      retry: function (fields) { return call("retry", [fields]); },
      fail: function (error, fields) { return call("recordFailure", [error, fields]); },
      readiness: readiness,
      markReady: markReady,
      measureModule: measureModule,
      exporterAvailable: !!resolve("ProdigyPerformanceExporter", "./prodigy-performance-exporter.js"),
      get redactedPreview() { return lastExportPreview; },
      recordMissing: function (phase) { return call("recordMissing", [phase]); },
      finalize: finalize,
      previewExport: function (exportOptions) { return controller ? controller.preview(exportOptions) : null; },
      createExporter: function (exportOptions) { return controller ? controller.createExporter(exportOptions) : null; },
      preview: function (exportOptions) { return controller ? controller.preview(exportOptions) : null; },
      confirm: function (confirmation) { return controller ? controller.confirm(confirmation) : null; },
      save: function () { return controller ? controller.save() : null; },
      pendingReceipt: function () { return controller ? controller.pendingReceipt() : null; },
      state: function () { return controller ? controller.state() : "unavailable"; },
      dispose: dispose,
      get disposed() { return disposedMarked; }
    };
    controller = createController(session, config);
    session.controller = controller;
    session.campaign = controller;
    call("mark", ["hub_start", { scope: workspaceId, status: "started" }]);
    var frozenSession = Object.freeze(session);
    campaignRegistry[workspaceId] = controller;
    return frozenSession;
  }

  function getOrCreateSession(options) {
    var config = options && typeof options === "object" ? options : {};
    var workspaceId = safeId(config.workspace_id || config.workspaceId || (root && root.__prodigyMeasurementEntry && root.__prodigyMeasurementEntry.workspaceId), "workspace");
    var entry = root && root.__prodigyMeasurementEntry;
    if (entry && entry.session && entry.workspaceId === workspaceId) return entry.session;
    var session = createSession(Object.assign({}, config, { workspace_id: workspaceId }));
    if (root) root.__prodigyMeasurementEntry = { workspaceId: workspaceId, session: session, options: config };
    return session;
  }

  function createCampaign(options) {
    var config = options && typeof options === "object" ? options : {};
    var suppliedSession = config.session && typeof config.session === "object" ? config.session : null;
    var session = suppliedSession || createSession(config);
    var controller = session && session.controller;
    if (!controller) controller = unavailableController(session && session.reason, session);
    var workspaceId = safeId(config.workspace_id || config.workspaceId || (session && session.workspaceId), "workspace");
    campaignRegistry[workspaceId] = controller;
    return controller;
  }

  function getCampaign(workspaceId) {
    return campaignRegistry[safeId(workspaceId, "workspace")] || null;
  }

  function getOrCreateCampaign(options) {
    var config = options && typeof options === "object" ? options : {};
    var workspaceId = safeId(config.workspace_id || config.workspaceId, "workspace");
    var existing = campaignRegistry[workspaceId];
    if (existing) return existing;
    var session = getOrCreateSession(Object.assign({}, config, { workspace_id: workspaceId }));
    var controller = session && session.controller ? session.controller : unavailableController(session && session.reason, session);
    campaignRegistry[workspaceId] = controller;
    return controller;
  }

  function registerCampaign(workspaceId, controller) {
    var key = safeId(workspaceId, "workspace");
    if (!controller || typeof controller !== "object") return null;
    campaignRegistry[key] = controller;
    return controller;
  }

  function disposeCampaign(workspaceId, fields) {
    var controller = getCampaign(workspaceId);
    return controller && typeof controller.dispose === "function" ? controller.dispose(fields) : null;
  }

  var campaignApi = Object.freeze({
    create: createCampaign,
    createCampaign: createCampaign,
    createController: createCampaign,
    createCampaignController: createCampaign,
    register: registerCampaign,
    get: getCampaign,
    getCampaign: getCampaign,
    getOrCreate: getOrCreateCampaign,
    getOrCreateCampaign: getOrCreateCampaign,
    dispose: disposeCampaign
  });
  var api = Object.freeze({
    createSession: createSession,
    getOrCreateSession: getOrCreateSession,
    createCampaign: createCampaign,
    createController: createCampaign,
    createCampaignController: createCampaign,
    getCampaign: getCampaign,
    getOrCreateCampaign: getOrCreateCampaign,
    campaignRegistry: campaignApi,
    unavailable: noMeasurement
  });
  if (root && root.__prodigyMeasurementEntry && !root.__prodigyMeasurementEntry.session) {
    getOrCreateSession(root.__prodigyMeasurementEntry.options || root.__prodigyMeasurementEntry);
  }
  if (root) {
    root.ProdigyPerformanceCampaign = campaignApi;
    root.ProdigyWorkspaceMeasurement = api;
  }
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
