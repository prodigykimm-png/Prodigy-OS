(function (root) {
  "use strict";

  const identityApi = root.LLMWikiIdentityResolution || (typeof require === "function" ? require("./llmwiki-identity-resolution.js") : null);
  const operationApi = root.LLMWikiOperationContract || (typeof require === "function" ? require("./llmwiki-operation-contract.js") : null);
  const LIFECYCLE_ROUTING_VERSION = "llmwiki_lifecycle_routing_v1";
  const LANES = Object.freeze(["operational", "epistemic", "mixed", "none"]);
  const DESTINATIONS = Object.freeze(["literature", "fleeting", "knowledge_candidate", "canonical_knowledge", "para_object", "none"]);
  const REVIEW_STATES = Object.freeze(["review", "hold", "not_required"]);
  const TARGET_SLOTS = Object.freeze({
    people: Object.freeze(["core_interaction", "memo"]),
    project: Object.freeze(["progress_note", "review_lesson", "related_knowledge"]),
    venue: Object.freeze(["memo", "related_knowledge"]),
    auction: Object.freeze(["auction_note", "review_lesson", "related_knowledge"]),
    region: Object.freeze(["direct_experience", "research_reference", "briefing_memo", "related_knowledge"]),
  });
  const ID = /^[a-z][a-z0-9_-]{2,127}$/u;

  function plain(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }
  function trim(value) { return typeof value === "string" ? value.trim() : ""; }
  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!plain(value)) return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freeze(item)])));
  }
  function ok(value) { return freeze({ ok: true, value }); }
  function fail(field, reason) { return freeze({ ok: false, field, reason }); }
  function failure(value) { return plain(value) && value.ok === false; }
  function allowed(input, fields, field) {
    if (!plain(input)) return fail(field, "malformed_input");
    for (const key of Object.keys(input)) if (!fields.has(key)) return fail(`${field}.${key}`, "unknown_field");
    return null;
  }
  function id(value, field) {
    const normalized = trim(value);
    return ID.test(normalized) ? normalized : fail(field, "invalid_unit_id");
  }

  function targetFor(raw) {
    const unknown = allowed(raw, new Set(["object_type", "slot"]), "target");
    if (unknown) return unknown;
    const objectType = trim(raw.object_type);
    const slot = trim(raw.slot);
    if (!Object.hasOwn(TARGET_SLOTS, objectType)) return fail("target.object_type", "unknown_object_type");
    if (!TARGET_SLOTS[objectType].includes(slot)) return fail("target.slot", "unknown_target_slot");
    return { object_type: objectType, slot };
  }

  function destinationFor(unit) {
    if (unit.lane === "none") return "none";
    if (unit.lane === "operational") return "para_object";
    if (unit.semantic_type === "source_material" && unit.source_bound === true) return "literature";
    if (unit.semantic_type === "personal_thought") return "fleeting";
    if (unit.semantic_type === "reusable_knowledge") return unit.promotion_complete === true ? "canonical_knowledge" : "knowledge_candidate";
    return null;
  }

  function validateUnit(unit, allowMixed) {
    const fields = allowMixed
      ? new Set(["unit_id", "lane", "components"])
      : new Set(["unit_id", "lane", "semantic_type", "source_bound", "promotion_complete", "target", "identity"]);
    const unknown = allowed(unit, fields, "unit");
    if (unknown) return unknown;
    const unitId = id(unit.unit_id, "unit.unit_id");
    if (failure(unitId)) return unitId;
    const lane = trim(unit.lane);
    if (!LANES.includes(lane)) return fail("unit.lane", "unknown_lane");
    if (lane === "mixed" && !allowMixed) return fail("unit.lane", "nested_mixed_unit");
    if (lane === "mixed") return { unit_id: unitId, lane, components: unit.components };
    if (lane === "none") {
      if (trim(unit.semantic_type) !== "none") return fail("unit.semantic_type", "none_lane_requires_none_semantic_type");
      return { unit_id: unitId, lane, semantic_type: "none" };
    }
    const semanticType = trim(unit.semantic_type);
    const validTypes = lane === "operational" ? ["object_state"] : ["source_material", "personal_thought", "reusable_knowledge"];
    if (!validTypes.includes(semanticType)) return fail("unit.semantic_type", "semantic_type_not_allowed_for_lane");
    if (!plain(unit.identity)) return fail("unit.identity", "identity_required");
    if (lane === "operational") {
      const target = targetFor(unit.target);
      if (failure(target)) return target;
      return { unit_id: unitId, lane, semantic_type: semanticType, target, identity: unit.identity };
    }
    if (semanticType === "source_material" && unit.source_bound !== true) return fail("unit.source_bound", "source_binding_required");
    if (semanticType === "reusable_knowledge" && typeof unit.promotion_complete !== "boolean") return fail("unit.promotion_complete", "promotion_completeness_required");
    return {
      unit_id: unitId,
      lane,
      semantic_type: semanticType,
      ...(semanticType === "source_material" ? { source_bound: true } : {}),
      ...(semanticType === "reusable_knowledge" ? { promotion_complete: unit.promotion_complete } : {}),
      identity: unit.identity,
    };
  }

  function decisionFor(unit, linkId) {
    const destination = destinationFor(unit);
    if (!destination) return fail("unit", "destination_not_derivable");
    if (destination === "none") return ok({
      lifecycle_routing_version: LIFECYCLE_ROUTING_VERSION,
      decision_id: `decision_${unit.unit_id}`,
      lane: "none",
      destination: "none",
      review_state: "not_required",
    });
    const identity = identityApi?.resolveIdentity?.(unit.identity);
    if (!identity) return fail("identity", "identity_resolution_unavailable");
    if (identity.ok !== true) return identity;
    const decision = {
      lifecycle_routing_version: LIFECYCLE_ROUTING_VERSION,
      decision_id: `decision_${unit.unit_id}`,
      lane: unit.lane,
      destination,
      identity_relation: identity.value.relation,
      identity_key: identity.value.identity_key,
      candidate_ids: identity.value.candidate_ids,
      ...(linkId ? { link_id: linkId } : {}),
      ...(unit.target ? { target: unit.target } : {}),
    };
    if (identity.value.relation === "ambiguous") return ok({ ...decision, review_state: "hold" });
    const derived = identityApi.deriveOperation(identity.value.relation);
    if (derived.ok !== true) return derived;
    if (!operationApi?.OPERATION_KINDS?.includes(derived.value.operation)) return fail("operation", "operation_contract_unavailable");
    return ok({ ...decision, operation: derived.value.operation, review_state: "review" });
  }

  function splitMixedUnit(unit) {
    const parsed = validateUnit(unit, true);
    if (failure(parsed)) return parsed;
    if (parsed.lane !== "mixed") return fail("unit.lane", "mixed_lane_required");
    if (!Array.isArray(parsed.components) || parsed.components.length < 2) return fail("unit.components", "mixed_components_required");
    const linkId = `link_${parsed.unit_id}`;
    const decisions = [];
    for (let index = 0; index < parsed.components.length; index += 1) {
      const component = validateUnit(parsed.components[index], false);
      if (failure(component)) return component;
      if (component.lane === "none") return fail(`unit.components.${index}.lane`, "mixed_component_requires_authority_lane");
      const routed = decisionFor(component, linkId);
      if (routed.ok !== true) return routed;
      decisions.push(routed.value);
    }
    const destinations = new Set(decisions.map((item) => item.destination));
    if (!destinations.has("para_object") || decisions.some((item) => item.destination === "para_object" && item.lane !== "operational")) return fail("unit.components", "mixed_split_not_authority_separated");
    return ok({ lifecycle_routing_version: LIFECYCLE_ROUTING_VERSION, lane: "mixed", link_id: linkId, decisions });
  }

  function routeLifecycle(input) {
    if (!plain(input)) return fail("unit", "malformed_input");
    if (trim(input.lane) === "mixed") return splitMixedUnit(input);
    const unit = validateUnit(input, false);
    if (failure(unit)) return unit;
    return decisionFor(unit);
  }

  const api = freeze({ LIFECYCLE_ROUTING_VERSION, LANES, DESTINATIONS, REVIEW_STATES, TARGET_SLOTS, routeLifecycle, splitMixedUnit });
  root.LLMWikiLifecycleRoutingContract = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
