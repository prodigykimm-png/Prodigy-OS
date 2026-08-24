(function (root) {
  "use strict";

  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  }
  function freeze(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freeze));
    if (!value || typeof value !== "object") return value;
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freeze(item)])));
  }
  function create(options) {
    async function run(runToken, selected = ["refresh", "git"]) {
      let followUp = clone(options.getFollowUp() || options.seed());
      for (const name of selected) {
        const callback = options.followUps && options.followUps[name];
        if (typeof callback !== "function" || followUp[name].status === "succeeded") continue;
        if (!options.isCurrent(runToken)) return options.ignored(runToken);
        options.setActive(name);
        followUp[name] = { status: "running", attempts: followUp[name].attempts + 1, reason: null };
        options.dispatch(followUp);
        const beforeAudits = options.guard.getAudits().length;
        const guardedEntry = options.guard.entry({
          follow_up: name,
          follow_up_identity: [runToken.run_id, runToken.run_revision, name, followUp[name].attempts].join(":"),
          run_id: runToken.run_id,
          run_revision: runToken.run_revision,
          operation_id: options.operationId(),
          is_current: () => options.isCurrent(runToken),
          current_identity: options.currentIdentity,
        });
        let result;
        try {
          guardedEntry.assert_current();
          const extras = typeof options.getFollowUpExtras === "function" ? options.getFollowUpExtras(name) : {};
          result = await callback(freeze({ ...extras, outcome: options.getOutcome(), signal: runToken.abort_controller && runToken.abort_controller.signal, guarded_entry: guardedEntry }));
        } catch (error) { result = { ok: false, reason: error && error.message || `${name}_failed` }; }
        options.addGuardAudits(options.guard.getAudits().length - beforeAudits);
        if (!options.isCurrent(runToken)) return options.ignored(runToken);
        options.increment(name);
        followUp[name] = result && result.ok === true
          ? { status: "succeeded", attempts: followUp[name].attempts, reason: null }
          : { status: "failed", attempts: followUp[name].attempts, reason: result && result.reason || `${name}_failed` };
        followUp = clone(options.summarize(followUp));
        options.dispatch(followUp);
        if (!await options.save(runToken, followUp)) return options.ignored(runToken);
        options.setActive(null);
        options.publish();
      }
      return options.output(true, { canonical_outcome: options.canonicalOutcome(), follow_up: options.getFollowUp() });
    }
    return Object.freeze({ run });
  }

  const api = Object.freeze({ create });
  root.LLMWikiOperationFollowUpRunner = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
