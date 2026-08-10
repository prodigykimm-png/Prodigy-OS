(function (root) {
  "use strict";

  var SCHEMA_VERSION = 1;
  var CONTRACT_VERSION = "wave3-performance-receipt-export-v1";
  var RECEIPT_FILE = "receipt.json";
  var HASH_RE = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u;
  var SHA256_RE = /^[a-f0-9]{64}$/u;
  var RUN_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
  var PATH_RE = /(?:^|_)(?:path|file|directory|dir|vault|folder|location|target)(?:$|_)/i;
  var SECRET_RE = /(?:pass(?:word)?|secret|token|api[_-]?key|authorization|cookie|credential|private[_-]?key|access[_-]?key)/i;
  var CONTENT_RE = /(?:^|_)(?:content|body|note|raw|text|markdown|payload)(?:$|_)/i;
  function isSafeRelativeModulePath(value) {
    return typeof value === "string"
      && value.length > 0
      && value.length <= 240
      && !value.startsWith("/")
      && !value.startsWith("~")
      && value.indexOf("\\") === -1
      && !value.split("/").some(function (part) { return part === "" || part === "." || part === ".."; })
      && !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value);
  }

  var REASON_CODES = Object.freeze({
    PREVIEW_READY: "PREVIEW_READY",
    RECEIPT_REQUIRED: "RECEIPT_REQUIRED",
    RECEIPT_NOT_SERIALIZABLE: "RECEIPT_NOT_SERIALIZABLE",
    MISSING_RUN_ID: "MISSING_RUN_ID",
    INVALID_RUN_ID: "INVALID_RUN_ID",
    MISSING_FINAL_SHA: "MISSING_FINAL_SHA",
    INVALID_FINAL_SHA: "INVALID_FINAL_SHA",
    MIXED_SHA: "MIXED_SHA",
    MISSING_SOURCE_SHA: "MISSING_SOURCE_SHA",
    INVALID_SOURCE_SHA: "INVALID_SOURCE_SHA",
    MISSING_SETTINGS_SHA: "MISSING_SETTINGS_SHA",
    INVALID_SETTINGS_SHA: "INVALID_SETTINGS_SHA",
    MISSING_MARKS: "MISSING_MARKS",
    INVALID_CONFIGURATION_SHA: "INVALID_CONFIGURATION_SHA",
    UNSUPPORTED_PHYSICAL_CLAIM: "UNSUPPORTED_PHYSICAL_CLAIM",
    SECRET_PRESENT: "SECRET_PRESENT",
    UNAPPROVED_SETTINGS_CHANGE: "UNAPPROVED_SETTINGS_CHANGE",
    DESTINATION_REQUIRED: "DESTINATION_REQUIRED",
    DESTINATION_NOT_ABSOLUTE: "DESTINATION_NOT_ABSOLUTE",
    VAULT_BOUNDARY_UNCONFIRMED: "VAULT_BOUNDARY_UNCONFIRMED",
    DESTINATION_INSIDE_VAULT: "DESTINATION_INSIDE_VAULT",
    PATH_TRAVERSAL: "PATH_TRAVERSAL",
    UNAPPROVED_WRITE: "UNAPPROVED_WRITE",
    NOT_CONFIRMED: "NOT_CONFIRMED",
    OVERWRITE_REFUSED: "OVERWRITE_REFUSED",
    WRITER_UNAVAILABLE: "WRITER_UNAVAILABLE",
    WRITE_FAILED: "WRITE_FAILED",
    RETRY_UNAVAILABLE: "RETRY_UNAVAILABLE"
  });

  var nodeFs = null;
  var nodePath = null;
  try {
    if (typeof require === "function") {
      nodeFs = require("node:fs");
      nodePath = require("node:path");
    }
  } catch (error) {
    nodeFs = null;
    nodePath = null;
  }

  function own(object, key) {
    return !!object && Object.prototype.hasOwnProperty.call(object, key);
  }

  function isPlainObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    var prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function isRedactionControlKey(keyName) {
    return /^(?:secrets?_removed|user_content_excluded|fields_removed)$/iu.test(String(keyName || ""));
  }
  function cloneAndRedact(value, state, keyName) {
    var key = String(keyName || "");
    if (isRedactionControlKey(key)) return value;
    if (SECRET_RE.test(key)) {
      state.redactedKeys.push(key);
      return "[REDACTED_SECRET]";
    }
    if (PATH_RE.test(key) && !(key === "module_path" && isSafeRelativeModulePath(value))) {
      state.redactedKeys.push(key);
      return "[REDACTED_PATH]";
    }
    if (CONTENT_RE.test(key)) {
      state.redactedKeys.push(key);
      return "[REDACTED_CONTENT]";
    }
    if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") return value;
    if (typeof value === "bigint" || typeof value === "function" || typeof value === "symbol" || value === undefined) {
      state.serializable = false;
      return null;
    }
    if (state.seen.indexOf(value) >= 0) {
      state.serializable = false;
      return "[REDACTED_CYCLE]";
    }
    state.seen.push(value);
    if (Array.isArray(value)) {
      var arrayResult = value.map(function (item) { return cloneAndRedact(item, state, ""); });
      state.seen.pop();
      return arrayResult;
    }
    if (!isPlainObject(value)) {
      state.serializable = false;
      state.seen.pop();
      return "[REDACTED_NON_JSON]";
    }
    var result = {};
    Object.keys(value).sort().forEach(function (childKey) {
      result[childKey] = cloneAndRedact(value[childKey], state, childKey);
    });
    state.seen.pop();
    return result;
  }

  function redactReceipt(receipt) {
    var state = { redactedKeys: [], seen: [], serializable: true };
    var redacted = cloneAndRedact(receipt, state, "");
    return {
      receipt: redacted,
      redactedKeys: state.redactedKeys.slice(),
      serializable: state.serializable
    };
  }
  function prepareExportReceipt(receipt) {
    var redacted = redactReceipt(receipt);
    if (!redacted.serializable || !redacted.receipt || typeof redacted.receipt !== "object" || Array.isArray(redacted.receipt)) {
      return redacted;
    }
    var output = redacted.receipt;
    if (!own(output, "physical_claim_status")) output.physical_claim_status = "not_proven";
    if (!own(output, "physical_device_success")) output.physical_device_success = false;
    var existingRedaction = output.redaction && typeof output.redaction === "object" && !Array.isArray(output.redaction)
      ? output.redaction
      : {};
    output.redaction = Object.assign({}, existingRedaction, {
      applied: true,
      user_content_excluded: true,
      secrets_removed: true,
      fields_removed: Array.from(new Set((Array.isArray(existingRedaction.fields_removed) ? existingRedaction.fields_removed : []).concat(redacted.redactedKeys)))
    });
    return { receipt: output, redactedKeys: redacted.redactedKeys, serializable: redacted.serializable };
  }

  function stringValue(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function fieldValues(receipt, keys) {
    var values = [];
    keys.forEach(function (key) {
      if (own(receipt, key) && receipt[key] !== undefined && receipt[key] !== null && receipt[key] !== "") {
        values.push({ key: key, value: String(receipt[key]).trim() });
      }
      if (receipt && receipt.metadata && typeof receipt.metadata === "object" && own(receipt.metadata, key)) {
        var nested = receipt.metadata[key];
        if (nested !== undefined && nested !== null && nested !== "") values.push({ key: "metadata." + key, value: String(nested).trim() });
      }
    });
    return values;
  }

  function uniqueValues(values) {
    return values.reduce(function (out, item) {
      if (out.indexOf(item.value) < 0) out.push(item.value);
      return out;
    }, []);
  }

  function firstField(receipt, keys) {
    var values = fieldValues(receipt, keys);
    return {
      values: values,
      value: values.length ? values[0].value : "",
      mixed: uniqueValues(values).length > 1
    };
  }

  function optionField(options, keys) {
    for (var index = 0; index < keys.length; index += 1) {
      var key = keys[index];
      if (options && own(options, key) && options[key] !== undefined && options[key] !== null && options[key] !== "") {
        return String(options[key]).trim();
      }
    }
    return "";
  }

  function collectValidationCodes(receipt, options, strict) {
    var codes = [];
    if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
      return [REASON_CODES.RECEIPT_REQUIRED];
    }
    var redacted = redactReceipt(receipt);
    if (!redacted.serializable) codes.push(REASON_CODES.RECEIPT_NOT_SERIALIZABLE);
    if (hasSecretKey(receipt)) codes.push(REASON_CODES.SECRET_PRESENT);
    if (hasMissingMarks(receipt)) codes.push(REASON_CODES.MISSING_MARKS);

    var run = firstField(receipt, ["run_id", "runId"]);
    var final = firstField(receipt, ["final_git_sha", "final_sha", "finalSha", "finalSHA"]);
    var source = firstField(receipt, ["source_sha256", "sourceSha256"]);
    var settings = firstField(receipt, ["settings_sha256", "settingsSha256"]);
    var configuration = firstField(receipt, ["configuration_sha256", "configurationSha256"]);
    var optionRun = optionField(options, ["run_id", "runId"]);
    var optionFinal = optionField(options, ["final_git_sha", "final_sha", "finalSha", "finalSHA"]);
    var optionSource = optionField(options, ["source_sha256", "sourceSha256", "sourceSha"]);
    var optionSettings = optionField(options, ["settings_sha256", "settingsSha256", "settingsSha"]);
    var optionConfiguration = optionField(options, ["configuration_sha256", "configurationSha256", "configurationSha"]);

    if (run.mixed || final.mixed || source.mixed || settings.mixed || configuration.mixed) codes.push(REASON_CODES.MIXED_SHA);
    var runId = optionRun || run.value;
    var finalSha = optionFinal || final.value;
    if (!run.value) codes.push(REASON_CODES.MISSING_RUN_ID);
    else if (!RUN_ID_RE.test(run.value)) codes.push(REASON_CODES.INVALID_RUN_ID);
    if (!final.value) codes.push(REASON_CODES.MISSING_FINAL_SHA);
    else if (!HASH_RE.test(final.value)) codes.push(REASON_CODES.INVALID_FINAL_SHA);
    if (run.value && optionRun && run.value !== optionRun) codes.push(REASON_CODES.MIXED_SHA);
    if (final.value && optionFinal && final.value !== optionFinal) codes.push(REASON_CODES.MIXED_SHA);
    if (source.value && optionSource && source.value !== optionSource) codes.push(REASON_CODES.MIXED_SHA);
    if (settings.value && optionSettings && settings.value !== optionSettings) codes.push(REASON_CODES.MIXED_SHA);
    if (configuration.value && optionConfiguration && configuration.value !== optionConfiguration) codes.push(REASON_CODES.MIXED_SHA);
    if (optionConfiguration && !configuration.value) codes.push(REASON_CODES.MIXED_SHA);

    if (!source.value) codes.push(REASON_CODES.MISSING_SOURCE_SHA);
    else if (!SHA256_RE.test(source.value)) codes.push(REASON_CODES.INVALID_SOURCE_SHA);
    if (!settings.value) codes.push(REASON_CODES.MISSING_SETTINGS_SHA);
    else if (!SHA256_RE.test(settings.value)) codes.push(REASON_CODES.INVALID_SETTINGS_SHA);
    if (configuration.value && !SHA256_RE.test(configuration.value)) codes.push(REASON_CODES.INVALID_CONFIGURATION_SHA);

    if (hasUnsupportedPhysicalClaim(receipt)) codes.push(REASON_CODES.UNSUPPORTED_PHYSICAL_CLAIM);
    if (hasUnapprovedSettingsChange(receipt, options)) codes.push(REASON_CODES.UNAPPROVED_SETTINGS_CHANGE);
    return codes.filter(function (code, index, all) { return all.indexOf(code) === index; });
  }

  function isExplicitlyFalse(value) {
    return value === false || value === 0 || value === "false" || value === "not_proven" || value === "not-claimed" || value === "unproven" || value === "unsupported";
  }

  function hasMissingMarks(receipt) {
    if (!Array.isArray(receipt.marks) || receipt.marks.length === 0) return true;
    var phases = receipt.marks.reduce(function (out, mark) {
      if (mark && typeof mark === "object" && typeof mark.phase === "string") out[mark.phase] = true;
      return out;
    }, {});
    var required = ["hub_start", "shell_mounted", "primary_action_ready"];
    if (receipt.instrumented === true) required.push("disposed");
    if (required.some(function (phase) { return !phases[phase]; })) return true;
    return Array.isArray(receipt.missing_marks) && receipt.missing_marks.length > 0;
  }
  function physicalClaimValue(value) {
    if (value === undefined || value === null || isExplicitlyFalse(value)) return false;
    if (typeof value === "string") {
      var normalized = value.trim().toLowerCase();
      return /^(?:true|yes|pass|passed|success|successful|verified|proven|claimed|available)$/.test(normalized);
    }
    if (typeof value === "object") {
      if (own(value, "status")) return physicalClaimValue(value.status);
      if (own(value, "success")) return physicalClaimValue(value.success);
      if (own(value, "proven")) return physicalClaimValue(value.proven);
      if (own(value, "verified")) return physicalClaimValue(value.verified);
      return false;
    }
    return value === true;
  }

  function hasSecretKey(value, keyName) {
    var key = String(keyName || "");
    if (isRedactionControlKey(key)) return false;
    if (SECRET_RE.test(key)) return true;
    if (!value || typeof value !== "object") return false;
    if (Array.isArray(value)) return value.some(function (item) { return hasSecretKey(item, ""); });
    return Object.keys(value).some(function (childKey) {
      return !isRedactionControlKey(childKey) && (SECRET_RE.test(childKey) || hasSecretKey(value[childKey], childKey));
    });
  }
  function hasUnsupportedPhysicalClaim(value, keyName) {
    if (!value || typeof value !== "object") return false;
    var key = String(keyName || "").toLowerCase();
    if (/(?:physical|mobile|iphone|ipad|device)/.test(key) && physicalClaimValue(value)) return true;
    if (Array.isArray(value)) return value.some(function (item) { return hasUnsupportedPhysicalClaim(item, keyName); });
    return Object.keys(value).some(function (childKey) {
      if (/(?:physical|mobile|iphone|ipad|device)/i.test(childKey) && physicalClaimValue(value[childKey])) return true;
      return hasUnsupportedPhysicalClaim(value[childKey], childKey);
    });
  }

  function hasUnapprovedSettingsChange(receipt, options) {
    var changed = receipt.settings_changed === true
      || receipt.settingsChanged === true
      || receipt.configuration_changed === true
      || receipt.configurationChanged === true;
    if (!changed && receipt.claims && typeof receipt.claims === "object") {
      changed = receipt.claims.settings_changed === true || receipt.claims.configuration_changed === true;
    }
    if (!changed) return false;
    if (options && options.settingsApproved === true) return false;
    return !(receipt.settings_approved === true
      || receipt.settingsApproved === true
      || receipt.settings_approval === "approved"
      || receipt.settingsApproval === "approved");
  }

  function absolutePath(value) {
    var text = stringValue(value);
    if (!text) return false;
    if (nodePath && typeof nodePath.isAbsolute === "function") return nodePath.isAbsolute(text);
    return /^\/(?:[^/]|$)/u.test(text) || /^[A-Za-z]:[\\/]/u.test(text);
  }

  function resolvedPath(value) {
    if (nodePath) return nodePath.resolve(String(value));
    return String(value).replace(/[\\/]+/g, "/").replace(/\/$/u, "");
  }

  function isWithin(parent, candidate) {
    if (nodePath) {
      var relative = nodePath.relative(parent, candidate);
      return relative === "" || (relative !== ".." && relative.indexOf(".." + nodePath.sep) !== 0 && !nodePath.isAbsolute(relative));
    }
    var rootPath = parent.replace(/[\\/]+/g, "/").replace(/\/$/u, "") + "/";
    var child = candidate.replace(/[\\/]+/g, "/");
    return child === parent || child.indexOf(rootPath) === 0;
  }

  function validateDestination(options, finalSha, runId) {
    var rootPath = optionField(options, ["destinationRoot", "externalRoot", "receiptRoot"]);
    if (!rootPath) return { ok: false, code: REASON_CODES.DESTINATION_REQUIRED };
    if (!absolutePath(rootPath)) return { ok: false, code: REASON_CODES.DESTINATION_NOT_ABSOLUTE };
    if (!finalSha || !runId) return { ok: false, code: REASON_CODES.PATH_TRAVERSAL };
    if (finalSha.indexOf("/") >= 0 || finalSha.indexOf("\\") >= 0 || runId.indexOf("/") >= 0 || runId.indexOf("\\") >= 0 || runId === "." || runId === ".." || finalSha === "." || finalSha === "..") {
      return { ok: false, code: REASON_CODES.PATH_TRAVERSAL };
    }
    var root = resolvedPath(rootPath);
    var vaultRoot = optionField(options, ["vaultRoot", "vaultPath"]);
    if (!vaultRoot && options && options.externalDestination !== true) {
      return { ok: false, code: REASON_CODES.VAULT_BOUNDARY_UNCONFIRMED };
    }
    if (vaultRoot) {
      if (!absolutePath(vaultRoot)) return { ok: false, code: REASON_CODES.VAULT_BOUNDARY_UNCONFIRMED };
      var vault = resolvedPath(vaultRoot);
      if (isWithin(vault, root) || isWithin(vault, root + (nodePath ? nodePath.sep : "/") + finalSha)) {
        return { ok: false, code: REASON_CODES.DESTINATION_INSIDE_VAULT };
      }
    }
    var target = nodePath
      ? nodePath.join(root, finalSha, runId, RECEIPT_FILE)
      : root + "/" + finalSha + "/" + runId + "/" + RECEIPT_FILE;
    if (!isWithin(root, target)) return { ok: false, code: REASON_CODES.PATH_TRAVERSAL };
    return { ok: true, root: root, path: target };
  }

  function inspectReceipt(receipt, options, strict) {
    var opts = options && typeof options === "object" ? options : {};
    var isStrict = strict === true;
    var codes = collectValidationCodes(receipt, opts, isStrict);
    var run = firstField(receipt || {}, ["run_id", "runId"]);
    var final = firstField(receipt || {}, ["final_git_sha", "final_sha", "finalSha", "finalSHA"]);
    var runId = optionField(opts, ["run_id", "runId"]) || run.value;
    var finalSha = optionField(opts, ["final_git_sha", "final_sha", "finalSha", "finalSHA"]) || final.value;
    var destinationRoot = optionField(opts, ["destinationRoot", "externalRoot", "receiptRoot"]);
    var destination = destinationRoot || isStrict
      ? validateDestination(opts, finalSha, runId)
      : { ok: false, code: REASON_CODES.DESTINATION_REQUIRED };
    if (destinationRoot || isStrict) {
      if (!destination.ok) codes.push(destination.code);
    }
    codes = codes.filter(function (code, index, all) { return all.indexOf(code) === index; });
    return {
      ok: codes.length === 0,
      codes: codes,
      reasonCode: codes.length ? codes[0] : REASON_CODES.PREVIEW_READY,
      runId: runId,
      finalSha: finalSha,
      destination: destination
    };
  }

  function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value && typeof value === "object") {
      var result = {};
      Object.keys(value).sort().forEach(function (key) { result[key] = stableValue(value[key]); });
      return result;
    }
    return value;
  }

  function stableJson(value) {
    return JSON.stringify(stableValue(value), null, 2) + "\n";
  }

  function buildPreview(receipt, options) {
    var redacted = redactReceipt(receipt);
    var validation = inspectReceipt(receipt, options || {}, false);
    var previewReceipt = redacted.receipt;
    if (previewReceipt && typeof previewReceipt === "object" && !Array.isArray(previewReceipt)) {
      previewReceipt.export_contract_version = CONTRACT_VERSION;
      previewReceipt.physical_mobile_claim = "not_proven";
    }
    var preview = {
      schemaVersion: SCHEMA_VERSION,
      contractVersion: CONTRACT_VERSION,
      status: validation.ok ? "preview" : "blocked",
      ready: validation.ok,
      confirmed: false,
      redacted: true,
      redactedKeys: Object.freeze(redacted.redactedKeys.slice()),
      receipt: previewReceipt,
      redactedReceipt: previewReceipt,
      destinationPath: validation.destination.ok ? validation.destination.path : null,
      runId: validation.runId || null,
      finalSha: validation.finalSha || null,
      reasonCode: validation.reasonCode,
      reasonCodes: Object.freeze(validation.codes.slice()),
      physicalMobileClaim: "not_proven"
    };
    return Object.freeze(preview);
  }

  function ExportError(code, message) {
    this.name = "ProdigyReceiptExportError";
    this.code = code;
    this.message = message || code;
    if (Error.captureStackTrace) Error.captureStackTrace(this, ExportError);
  }
  ExportError.prototype = Object.create(Error.prototype);
  ExportError.prototype.constructor = ExportError;

  function ReceiptExporter(options, maybeOptions) {
    if (!(this instanceof ReceiptExporter)) {
      return maybeOptions === undefined
        ? new ReceiptExporter(options)
        : new ReceiptExporter(options, maybeOptions);
    }
    var input;
    if (maybeOptions !== undefined) {
      input = Object.assign({}, maybeOptions || {}, { receipt: options });
    } else if (options && options.receipt !== undefined) {
      input = Object.assign({}, options);
    } else {
      input = { receipt: options };
    }
    this._receipt = input.receipt;
    this._options = input;
    this._confirmed = false;
    this._approved = input.approved === true;
    this._state = "pending";
    this._lastError = null;
    this._lastPreview = null;
  }

  ReceiptExporter.prototype.preview = function () {
    this._lastPreview = buildPreview(this._receipt, this._options);
    return this._lastPreview;
  };

  ReceiptExporter.prototype.confirm = function (confirmation) {
    var value = confirmation;
    if (value === true) value = { approved: true };
    if (!value || typeof value !== "object") value = {};
    if (value.approved === true || value.confirmed === true) this._approved = true;
    else if (confirmation === undefined && !own(this._options, "approved")) this._approved = true;
    var validation = inspectReceipt(this._receipt, this._options, true);
    if (!validation.ok) {
      this._state = "blocked";
      throw new ExportError(validation.reasonCode, "Receipt export confirmation blocked: " + validation.codes.join(", "));
    }
    if (!this._approved) {
      this._state = "blocked";
      throw new ExportError(REASON_CODES.UNAPPROVED_WRITE, "An explicit approved confirmation is required before writing a receipt");
    }
    this._confirmed = true;
    this._state = "confirmed";
    var preview = this.preview();
    return Object.freeze(Object.assign({}, preview, { confirmed: true, status: "confirmed" }));
  };

  ReceiptExporter.prototype.save = function () {
    if (!this._confirmed) throw new ExportError(REASON_CODES.NOT_CONFIRMED, "Receipt export requires confirm() before save()");
    if (!this._approved) throw new ExportError(REASON_CODES.UNAPPROVED_WRITE, "Receipt export is not approved");
    var validation = inspectReceipt(this._receipt, this._options, true);
    if (!validation.ok) {
      this._state = "blocked";
      throw new ExportError(validation.reasonCode, "Receipt export blocked: " + validation.codes.join(", "));
    }
    var writer = this._options.writeFile;
    var mkdir = this._options.mkdir;
    var exists = this._options.exists;
    if (!writer && this._options.writer && typeof this._options.writer.writeFile === "function") writer = this._options.writer.writeFile.bind(this._options.writer);
    if (!mkdir && this._options.writer && typeof this._options.writer.mkdir === "function") mkdir = this._options.writer.mkdir.bind(this._options.writer);
    if (!exists && this._options.writer && typeof this._options.writer.exists === "function") exists = this._options.writer.exists.bind(this._options.writer);
    if (!writer && nodeFs) {
      writer = function (target, content) { nodeFs.writeFileSync(target, content, { encoding: "utf8", flag: "wx" }); };
      mkdir = mkdir || function (target) { nodeFs.mkdirSync(target, { recursive: true }); };
      exists = exists || function (target) { return nodeFs.existsSync(target); };
    }
    if (typeof writer !== "function") {
      this._state = "failed";
      this._lastError = new ExportError(REASON_CODES.WRITER_UNAVAILABLE, "No external receipt writer is available");
      throw this._lastError;
    }
    var target = validation.destination.path;
    try {
      if (typeof exists === "function" && exists(target)) {
        throw new ExportError(REASON_CODES.OVERWRITE_REFUSED, "Receipt destination already exists; overwrite is refused");
      }
      var parent = nodePath ? nodePath.dirname(target) : target.slice(0, target.lastIndexOf("/"));
      if (typeof mkdir === "function") mkdir(parent);
      var redacted = prepareExportReceipt(this._receipt);
      if (!redacted.serializable) throw new ExportError(REASON_CODES.RECEIPT_NOT_SERIALIZABLE, "Receipt is not serializable");
      var content = stableJson(redacted.receipt);
      writer(target, content, { flag: "wx", overwrite: false });
      this._state = "saved";
      this._lastError = null;
      this._receipt = null;
      return Object.freeze({
        schemaVersion: SCHEMA_VERSION,
        contractVersion: CONTRACT_VERSION,
        status: "saved",
        path: target,
        runId: validation.runId,
        finalSha: validation.finalSha,
        redacted: true,
        physicalMobileClaim: "not_proven"
      });
    } catch (error) {
      this._state = "failed";
      this._lastError = error && error.code ? error : new ExportError(REASON_CODES.WRITE_FAILED, String(error && error.message ? error.message : error));
      throw this._lastError;
    }
  };

  ReceiptExporter.prototype.write = ReceiptExporter.prototype.save;
  ReceiptExporter.prototype.retry = function () {
    if (!this._receipt) throw new ExportError(REASON_CODES.RETRY_UNAVAILABLE, "No retained receipt is available for retry");
    if (!this._confirmed) throw new ExportError(REASON_CODES.NOT_CONFIRMED, "Receipt export requires confirmation before retry()");
    return this.save();
  };

  ReceiptExporter.prototype.pendingReceipt = function () {
    return this._receipt || null;
  };

  ReceiptExporter.prototype.state = function () {
    return this._state;
  };

  ReceiptExporter.prototype.lastError = function () {
    return this._lastError;
  };

  ReceiptExporter.prototype.path = function () {
    var preview = this._lastPreview || this.preview();
    return preview.destinationPath;
  };

  function createExporter(options, maybeOptions) {
    return new ReceiptExporter(options, maybeOptions);
  }

  function previewReceipt(receipt, options) {
    return buildPreview(receipt, options || {});
  }

  function confirmReceiptExport(exporter, confirmation) {
    if (!exporter || typeof exporter.confirm !== "function") throw new ExportError(REASON_CODES.RECEIPT_REQUIRED, "An exporter instance is required");
    return exporter.confirm(confirmation);
  }

  function saveReceiptExport(exporter) {
    if (!exporter || typeof exporter.save !== "function") throw new ExportError(REASON_CODES.RECEIPT_REQUIRED, "An exporter instance is required");
    return exporter.save();
  }

  var api = Object.freeze({
    SCHEMA_VERSION: SCHEMA_VERSION,
    CONTRACT_VERSION: CONTRACT_VERSION,
    RECEIPT_FILE: RECEIPT_FILE,
    REASON_CODES: REASON_CODES,
    redactReceipt: redactReceipt,
    prepareExportReceipt: prepareExportReceipt,
    buildPreview: buildPreview,
    createPreview: buildPreview,
    createReceiptPreview: buildPreview,
    preview: buildPreview,
    previewReceipt: previewReceipt,
    inspectReceipt: inspectReceipt,
    validateReceipt: function (receipt, options) { return inspectReceipt(receipt, options || {}, true); },
    resolveDestination: function (options, finalSha, runId) { return validateDestination(options || {}, finalSha, runId); },
    ExportError: ExportError,
    ReceiptExporter: ReceiptExporter,
    MobileSafeReceiptExporter: ReceiptExporter,
    createExporter: createExporter,
    createReceiptExporter: createExporter,
    confirmReceiptExport: confirmReceiptExport,
    confirmExport: confirmReceiptExport,
    saveReceiptExport: saveReceiptExport,
    saveExport: saveReceiptExport,
    stableJson: stableJson
  });

  root.ProdigyPerformanceExporter = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
