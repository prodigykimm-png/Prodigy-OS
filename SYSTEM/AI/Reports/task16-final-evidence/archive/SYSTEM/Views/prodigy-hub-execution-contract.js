"use strict";

/**
 * Declarative execution metadata for Hub modules.
 *
 * The evaluator kind is intentionally required. A path suffix or source text
 * never selects an ABI; callers must prove the module ABI in this contract.
 */
(function (root) {
  var SCHEMA_VERSION = 1;
  var EVALUATORS = Object.freeze(["global_iife", "commonjs_bridge", "local_adapter"]);
  var EXECUTION_KINDS = EVALUATORS;
  var EVALUATOR_SET = new Set(EVALUATORS);

  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function text(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!isObject(value)) return value;
    return Object.freeze(Object.keys(value).reduce(function (copy, key) {
      copy[key] = freeze(value[key]);
      return copy;
    }, {}));
  }

  function error(field, code, message) {
    return { field: field, code: code, message: message || code };
  }

  function safePath(value) {
    var path = text(value);
    if (!path || path === "<invalid>") return "";
    if (/^[A-Za-z]:[\\/]/.test(path) || path.charAt(0) === "/") return "";
    if (/\u0000|[\u0001-\u001f\u007f]/.test(path) || path.indexOf("\\") !== -1) return "";
    var parts = path.split("/");
    if (parts.some(function (part) { return part === "" || part === "." || part === ".."; })) return "";
    return path;
  }

  function listOfText(value, field, errors, required) {
    if (!Array.isArray(value)) {
      if (required) errors.push(error(field, "required_array", field + " must be an array"));
      return [];
    }
    var result = [];
    var seen = new Set();
    value.forEach(function (item, index) {
      var itemText = text(item);
      if (!itemText) {
        errors.push(error(field + "[" + index + "]", "non_empty_string", "list values must be non-empty strings"));
        return;
      }
      if (seen.has(itemText)) {
        errors.push(error(field + "[" + index + "]", "duplicate_value", "list values must be unique"));
        return;
      }
      seen.add(itemText);
      result.push(itemText);
    });
    return result;
  }

  function explicitAlias(item, aliases, field, errors) {
    var found;
    aliases.forEach(function (key) {
      if (!Object.prototype.hasOwnProperty.call(item, key)) return;
      if (found !== undefined) {
        var same = false;
        try { same = JSON.stringify(found) === JSON.stringify(item[key]); } catch (_) { same = false; }
        if (!same) errors.push(error(field, "conflicting_aliases", "execution metadata aliases disagree"));
      }
      if (found === undefined) found = item[key];
    });
    return found;
  }

  function normalizeReady(value, field, errors) {
    if (typeof value === "string") {
      var kind = text(value);
      if (!kind) errors.push(error(field, "empty_ready", "ready must be explicit"));
      return { kind: kind };
    }
    if (Array.isArray(value)) {
      if (value.length === 0) errors.push(error(field, "empty_ready", "ready must contain an observable signal"));
      return value.map(function (item, index) {
        if (typeof item === "string") {
          var signal = text(item);
          if (!signal) errors.push(error(field + "[" + index + "]", "empty_ready", "ready entries must be non-empty"));
          return signal;
        }
        if (!isObject(item)) {
          errors.push(error(field + "[" + index + "]", "object_or_string_required", "ready entries must be declarative"));
          return {};
        }
        return Object.assign({}, item);
      });
    }
    if (!isObject(value)) {
      errors.push(error(field, "required_object", "ready must be a string, array, or object"));
      return {};
    }
    var ready = {};
    Object.keys(value).forEach(function (key) {
      /* Readiness is data, not executable code. Keep common declarative
       * predicates while rejecting function-valued or unknown instructions. */
      var item = value[key];
      if (typeof item === "function") {
        errors.push(error(field + "." + key, "function_forbidden", "ready metadata cannot contain executable functions"));
        return;
      }
      if (key === "kind" || key === "type" || key === "name" || key === "global" || key === "global_name" || key === "selector" || key === "signal" || key === "event" || key === "predicate" || key === "status" || key === "value" || key === "timeout_ms" || key === "required") ready[key] = item;
      else errors.push(error(field + "." + key, "unknown_field", "ready contains an unsupported field"));
    });
    if (!text(ready.kind) && !text(ready.type) && !text(ready.name) && !text(ready.global) && !text(ready.global_name) && !text(ready.selector) && !text(ready.signal) && !text(ready.event) && !text(ready.predicate) && !text(ready.status)) {
      errors.push(error(field, "empty_ready", "ready must identify an observable readiness signal"));
    }
    if (ready.timeout_ms !== undefined && (!Number.isInteger(ready.timeout_ms) || ready.timeout_ms < 1)) {
      errors.push(error(field + ".timeout_ms", "invalid_timeout", "ready timeout must be a positive integer"));
    }
    if (ready.required !== undefined && typeof ready.required !== "boolean") errors.push(error(field + ".required", "boolean_required", "ready.required must be boolean"));
    return ready;
  }

  function normalizeExports(value, field, errors) {
    if (value === undefined) return [];
    if (Array.isArray(value)) return listOfText(value, field, errors, true);
    if (!isObject(value)) {
      errors.push(error(field, "required_array_or_object", "exports must be an array or object"));
      return [];
    }
    var exportsMetadata = {};
    Object.keys(value).forEach(function (key) {
      var item = value[key];
      if (typeof item === "function") errors.push(error(field + "." + key, "function_forbidden", "exports metadata cannot contain executable functions"));
      else exportsMetadata[key] = item;
    });
    return exportsMetadata;
  }

  function normalizeSideEffects(value, field, errors) {
    if (Array.isArray(value)) return listOfText(value, field, errors, true);
    if (!isObject(value)) {
      errors.push(error(field, "required_array_or_object", "side_effects must be an array or object"));
      return {};
    }
    var effects = {};
    Object.keys(value).forEach(function (key) {
      var item = value[key];
      if (typeof item !== "boolean" && typeof item !== "string" && !Array.isArray(item)) {
        errors.push(error(field + "." + key, "invalid_value", "side effect metadata must be declarative"));
        return;
      }
      effects[key] = Array.isArray(item) ? listOfText(item, field + "." + key, errors, false) : item;
    });
    return effects;
  }

  function normalizeRetry(value, field, errors) {
    if (!isObject(value)) {
      errors.push(error(field, "required_object", "retry metadata must be an object"));
      return {};
    }
    var retry = {};
    Object.keys(value).forEach(function (key) {
      if (["enabled", "max_attempts", "max_retries", "rerun_loaded", "backoff_ms", "stale_policy", "sync_pending_policy", "reason"].indexOf(key) === -1) {
        errors.push(error(field + "." + key, "unknown_field", "retry contains an unsupported field"));
        return;
      }
      retry[key] = value[key];
    });
    if (retry.enabled !== undefined && typeof retry.enabled !== "boolean") errors.push(error(field + ".enabled", "boolean_required", "retry.enabled must be boolean"));
    ["max_attempts", "max_retries", "backoff_ms"].forEach(function (key) {
      if (retry[key] !== undefined && (!Number.isInteger(retry[key]) || retry[key] < 0)) errors.push(error(field + "." + key, "non_negative_integer", "retry numeric metadata must be a non-negative integer"));
    });
    if (retry.rerun_loaded !== undefined && typeof retry.rerun_loaded !== "boolean") errors.push(error(field + ".rerun_loaded", "boolean_required", "retry.rerun_loaded must be boolean"));
    if (retry.stale_policy !== undefined && ["ignore", "report", "retry"].indexOf(text(retry.stale_policy)) === -1) errors.push(error(field + ".stale_policy", "invalid_policy", "unsupported stale policy"));
    if (retry.sync_pending_policy !== undefined && ["report", "retry", "fail"].indexOf(text(retry.sync_pending_policy)) === -1) errors.push(error(field + ".sync_pending_policy", "invalid_policy", "unsupported sync-pending policy"));
    return retry;
  }

  function normalizeOrderAfter(value, field, errors) {
    if (typeof value === "string") value = value ? [value] : [];
    return listOfText(value, field, errors, true);
  }

  function normalizeModule(item, index, errors) {
    if (!isObject(item)) {
      errors.push(error("modules[" + index + "]", "object_required", "module metadata must be an object"));
      return null;
    }
    Object.keys(item).forEach(function (key) {
      if (["path", "module_path", "modulePath", "required", "evaluator", "execution", "kind", "module_kind", "exports", "requires", "dependencies", "order_after", "side_effects", "ready", "readiness", "retry", "retry_metadata", "id"].indexOf(key) === -1) errors.push(error("modules[" + index + "]." + key, "unknown_field", "module metadata contains an unsupported field"));
    });
    var field = "modules[" + index + "]";
    var modulePath = safePath(explicitAlias(item, ["path", "module_path", "modulePath"], field + ".path", errors));
    if (!modulePath) errors.push(error(field + ".path", "safe_path_required", "module path must be relative and safe"));

    var required = item.required;
    if (typeof required !== "boolean") errors.push(error(field + ".required", "boolean_required", "required must be boolean"));
    var evaluator = text(explicitAlias(item, ["evaluator", "execution", "kind", "module_kind"], field + ".evaluator", errors));
    if (!EVALUATOR_SET.has(evaluator)) errors.push(error(field + ".evaluator", "explicit_evaluator_required", "evaluator must be global_iife, commonjs_bridge, or local_adapter"));
    var requiresValue = explicitAlias(item, ["requires", "dependencies"], field + ".requires", errors);
    var orderAfterValue = explicitAlias(item, ["order_after"], field + ".order_after", errors);
    var sideEffectsValue = item.side_effects;
    var readyValue = explicitAlias(item, ["ready", "readiness"], field + ".ready", errors);
    var retryValue = explicitAlias(item, ["retry", "retry_metadata"], field + ".retry", errors);

    var normalized = {
      path: modulePath,
      required: required,
      evaluator: evaluator,
      exports: normalizeExports(item.exports, field + ".exports", errors),
      requires: listOfText(requiresValue, field + ".requires", errors, true),
      order_after: normalizeOrderAfter(orderAfterValue, field + ".order_after", errors),
      side_effects: normalizeSideEffects(sideEffectsValue, field + ".side_effects", errors),
      ready: normalizeReady(readyValue, field + ".ready", errors),
      retry: normalizeRetry(retryValue, field + ".retry", errors)
    };
    if (item.id !== undefined) {
      var id = text(item.id);
      if (!id) errors.push(error(field + ".id", "non_empty_string", "module id must be non-empty"));
      else normalized.id = id;
    }
    return normalized;
  }

  function moduleEntries(value, errors) {
    if (Array.isArray(value)) return value.slice();
    if (!isObject(value)) {
      errors.push(error("modules", "required_array_or_object", "modules must be an array or object map"));
      return [];
    }
    return Object.keys(value).map(function (key) {
      var item = value[key];
      if (!isObject(item)) return item;
      var copy = Object.assign({}, item);
      if (copy.path === undefined && copy.module_path === undefined && copy.modulePath === undefined) copy.path = key;
      return copy;
    });
  }

  function hasPath(modules, path) {
    return modules.some(function (item) { return item.path === path; });
  }

  function hasOrderCycle(modules) {
    var byPath = new Map(modules.map(function (item) { return [item.path, item]; }));
    var visiting = new Set();
    var visited = new Set();
    function visit(path) {
      if (visiting.has(path)) return true;
      if (visited.has(path)) return false;
      visiting.add(path);
      var item = byPath.get(path);
      var cycle = item && item.order_after.some(visit);
      visiting.delete(path);
      visited.add(path);
      return cycle;
    }
    return modules.some(function (item) { return visit(item.path); });
  }

  function normalizeContract(input) {
    var errors = [];
    if (!isObject(input)) return { errors: [error("contract", "object_required", "execution contract must be an object")] };
    Object.keys(input).forEach(function (key) {
      if (["schema_version", "modules", "entries"].indexOf(key) === -1) errors.push(error(key, "unknown_field", "execution contract contains an unsupported field"));
    });
    if (input.schema_version !== SCHEMA_VERSION) errors.push(error("schema_version", "unsupported_version", "schema_version must be 1"));
    var modules = moduleEntries(input.modules !== undefined ? input.modules : input.entries, errors).map(function (item, index) {
      return normalizeModule(item, index, errors);
    }).filter(Boolean);
    if (modules.length === 0) errors.push(error("modules", "non_empty_required", "execution contract must contain at least one module"));

    var paths = new Set();
    modules.forEach(function (item, index) {
      if (paths.has(item.path)) errors.push(error("modules[" + index + "].path", "duplicate_path", "module paths must be unique"));
      paths.add(item.path);
    });
    modules.forEach(function (item, index) {
      item.requires.concat(item.order_after).forEach(function (dependency) {
        if (dependency === item.path) errors.push(error("modules[" + index + "]", "self_dependency", "module cannot order after or require itself"));
        else if (!paths.has(dependency)) errors.push(error("modules[" + index + "]", "unknown_dependency", "dependency and order_after values must name another contract module"));
      });
    });
    if (hasOrderCycle(modules)) errors.push(error("modules", "order_cycle", "order_after metadata must not contain a cycle"));
    if (errors.length) return { errors: errors };
    return {
      value: {
        schema_version: SCHEMA_VERSION,
        modules: modules
      },
      errors: []
    };
  }

  function validateExecutionContract(input) {
    var result = normalizeContract(input);
    if (result.errors.length) return freeze({ ok: false, valid: false, errors: result.errors });
    var value = freeze(result.value);
    return freeze({ ok: true, valid: true, value: value, contract: value, errors: [] });
  }

  function createExecutionContract(input) {
    var result = validateExecutionContract(input);
    if (!result.ok) {
      var message = result.errors.map(function (item) { return item.field + ": " + item.code; }).join(", ");
      var err = new Error("Invalid Hub execution contract — " + message);
      err.code = "invalid_execution_contract";
      err.errors = result.errors;
      throw err;
    }
    return result.value;
  }

  function assertExecutionContract(input) {
    return createExecutionContract(input);
  }

  function moduleFor(contract, modulePath) {
    var result = validateExecutionContract(contract);
    if (!result.ok) return result;
    var path = safePath(modulePath);
    var item = result.value.modules.find(function (candidate) { return candidate.path === path; });
    if (!item) return freeze({ ok: false, valid: false, errors: [error("module", "unknown_module", "module is not present in the execution contract")] });
    return freeze({ ok: true, valid: true, value: item, module: item, errors: [] });
  }

  var api = Object.freeze({
    SCHEMA_VERSION: SCHEMA_VERSION,
    EVALUATORS: EVALUATORS,
    EXECUTION_KINDS: EXECUTION_KINDS,
    validateExecutionContract: validateExecutionContract,
    validate: validateExecutionContract,
    normalize: createExecutionContract,
    getModule: moduleFor,
    createExecutionContract: createExecutionContract,
    assertExecutionContract: assertExecutionContract,
    moduleFor: moduleFor,
    safePath: safePath
  });
  root.ProdigyHubExecutionContract = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
