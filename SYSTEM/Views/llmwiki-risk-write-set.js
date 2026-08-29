(function (root) {
  "use strict";

  // Task 10 additive extension: lifecycle review destinations are accepted
  // alongside ZETA/PERMANENT; Permanent validity rules are unchanged.
  const CANONICAL_PREFIXES = Object.freeze(["ZETA/PERMANENT/", "ZETA/LITERATURE/", "ZETA/CANDIDATES/"]);

  function plain(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function validPath(value) {
    const prefix = typeof value === "string" ? CANONICAL_PREFIXES.find((candidate) => value.startsWith(candidate)) : undefined;
    return prefix !== undefined && !value.includes("..") && !value.includes("\\") && value.length > prefix.length;
  }
  function operationPaths(operation) {
    if (!plain(operation) || !Array.isArray(operation.destination_ids) || !plain(operation.effects)) throw new Error("invalid_risk_operation");
    const paths = [...operation.destination_ids];
    for (const effect of [...(operation.effects.deprecations || []), ...(operation.effects.supersessions || [])]) paths.push(effect.destination_id);
    if (!paths.every(validPath)) throw new Error("invalid_risk_write_path");
    const sorted = [...new Set(paths)].sort();
    if (sorted.length !== paths.length) throw new Error("duplicate_risk_write_path");
    return Object.freeze(sorted);
  }
  function packetPaths(packet, packetApi) {
    const authority = packetApi || root.LLMWikiRiskApprovalPacket;
    if (!authority || !authority.isRiskApprovalPacket(packet)) throw new Error("unbranded_risk_packet");
    return operationPaths(packet.operation);
  }
  function exactSet(packets, packetApi) {
    if (!Array.isArray(packets) || packets.length === 0) throw new Error("empty_risk_packet_set");
    const byPacket = {};
    const all = [];
    for (const packet of packets) {
      const paths = packetPaths(packet, packetApi);
      byPacket[packet.packet_id] = paths;
      all.push(...paths);
    }
    const allowed = [...new Set(all)].sort();
    if (allowed.length !== all.length) throw new Error("overlapping_risk_write_set");
    return Object.freeze({
      allowed_write_set: Object.freeze(allowed),
      packet_write_sets: Object.freeze(Object.fromEntries(Object.entries(byPacket).map(([id, paths]) => [id, Object.freeze([...paths])]))),
    });
  }
  function samePaths(left, right) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => value === right[index]);
  }

  const api = Object.freeze({ CANONICAL_PREFIXES, operationPaths, packetPaths, exactSet, samePaths });
  root.LLMWikiRiskWriteSet = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
