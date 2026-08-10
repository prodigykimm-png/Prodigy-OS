(function (root) {
  "use strict";

  var nextSession = 1;

  function resolve(name, relativePath) {
    if (root && root[name]) return root[name];
    if (typeof require === "function") {
      try { return require(relativePath); } catch (_error) { return null; }
    }
    return null;
  }

  function text(value, fallback) {
    var result = String(value === undefined || value === null ? "" : value).trim();
    return result || fallback;
  }

  function safeId(value, fallback) {
    var result = text(value, fallback).replace(/[^A-Za-z0-9._-]+/g, "-");
    return result.slice(0, 128) || fallback;
  }

  function noMeasurement(reason) {
    return Object.freeze({
      available: false,
      reason: reason || "measurement_unavailable",
      mark: function () { return null; },
      record: function () { return null; },
      start: function () { return null; },
      end: function () { return null; },
      measure: function (_phase, operation) { return typeof operation === "function" ? operation() : undefined; },
      retry: function () { return null; },
      fail: function () { return null; },
      readiness: function () { return null; },
      markReady: function () { return null; },
      markWorkspaceReady: function () { return null; },
      recordMissing: function () { return null; },
      finalize: function () { return null; },
      previewExport: function () { return null; },
      createExporter: function () { return null; },
      dispose: function () { return null; }
    });
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

    function call(method, args) {
      if (!recorder || typeof recorder[method] !== "function") return null;
      try { return recorder[method].apply(recorder, args || []); } catch (_error) { return null; }
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

    function finalize(receiptOptions) {
      var receipt = call("finalize", [receiptOptions && typeof receiptOptions === "object" ? receiptOptions : {}]);
      var ExporterApi = resolve("ProdigyPerformanceExporter", "./prodigy-performance-exporter.js");
      if (receipt && ExporterApi && typeof ExporterApi.prepareExportReceipt === "function") {
        try { lastExportPreview = ExporterApi.prepareExportReceipt(receipt); } catch (_error) { lastExportPreview = null; }
      }
      return receipt;
    }

    function previewExport(exportOptions) {
      var ExporterApi = resolve("ProdigyPerformanceExporter", "./prodigy-performance-exporter.js");
      if (!ExporterApi || typeof ExporterApi.previewReceipt !== "function") return null;
      var receipt = finalize(exportOptions && exportOptions.receiptOptions ? exportOptions.receiptOptions : exportOptions);
      if (!receipt) return null;
      var optionsValue = exportOptions && exportOptions.exportOptions ? exportOptions.exportOptions : exportOptions;
      try { return ExporterApi.previewReceipt(receipt, optionsValue || {}); } catch (_error) { return null; }
    }

    function createExporter(exportOptions) {
      var ExporterApi = resolve("ProdigyPerformanceExporter", "./prodigy-performance-exporter.js");
      if (!ExporterApi || typeof ExporterApi.createExporter !== "function") return null;
      var optionsValue = exportOptions && typeof exportOptions === "object" ? exportOptions : {};
      var receipt = optionsValue.receipt || finalize(optionsValue.receiptOptions || optionsValue);
      if (!receipt) return null;
      try {
        return ExporterApi.createExporter(Object.assign({}, optionsValue, { receipt: receipt }));
      } catch (_error) {
        return null;
      }
    }
    function markWorkspaceReady() {
      var map = {
        home: "home",
        knowledge: "knowledge",
        journal: "journal.daily",
        reading: "reading",
        personal: "personal.people",
        project: "project",
        auction: "auction",
        workout: "workout",
        region: "region",
        inbox: "inbox"
      };
      var selector = map[workspaceId];
      if (!selector) return null;
      var action = selector + ".open";
      if (selector === "journal.daily") action = "journal.daily.open";
      return markReady(selector, { status: "deterministic", enabledAction: { id: action, enabled: true } });
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
        try { return recorder.measure(phase, operation, fields); } catch (error) { throw error; }
      },
      retry: function (fields) { return call("retry", [fields]); },
      fail: function (error, fields) { return call("recordFailure", [error, fields]); },
      readiness: readiness,
      markReady: markReady,
      markWorkspaceReady: markWorkspaceReady,
      exporterAvailable: !!resolve("ProdigyPerformanceExporter", "./prodigy-performance-exporter.js"),
      get redactedPreview() { return lastExportPreview; },
      recordMissing: function (phase) { return call("recordMissing", [phase]); },
      finalize: finalize,
      previewExport: previewExport,
      createExporter: createExporter,
      dispose: function (fields) {
        var optionsValue = fields && typeof fields === "object" ? fields : {};
        if (optionsValue.cold_warm === "cold" || optionsValue.cold_warm === "warm") return call("dispose", [optionsValue]);
        return call("mark", ["disposed", {}]);
      }
    };
    call("mark", ["hub_start", { scope: workspaceId, status: "started" }]);
    return Object.freeze(session);
  }

  var api = Object.freeze({ createSession: createSession, unavailable: noMeasurement });
  if (root) root.ProdigyWorkspaceMeasurement = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
