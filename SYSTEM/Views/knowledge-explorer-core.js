(function (root) {
  "use strict";

  const SCHEMA_VERSION = 1;

  function token(value) {
    if (typeof value !== "string") return "";
    return value.trim().toLowerCase().replace(/\s+/g, "_");
  }

  function canonicalPath(value) {
    if (typeof value !== "string") return "";
    const parts = value.trim().replace(/\\/g, "/").normalize("NFC").split("/");
    const resolved = [];
    for (const part of parts) {
      if (!part || part === ".") continue;
      if (part === "..") {
        if (!resolved.length) return "";
        resolved.pop();
      } else {
        resolved.push(part);
      }
    }
    return resolved.join("/");
  }

  function recordPath(source) {
    if (!source || typeof source !== "object") return "";
    const filePath = source.file && typeof source.file === "object" ? source.file.path : "";
    return canonicalPath(source.source_path || source.path || filePath || "");
  }

  function metadata(source) {
    const frontmatter = source.frontmatter && typeof source.frontmatter === "object" && !Array.isArray(source.frontmatter)
      ? source.frontmatter
      : {};
    return { ...frontmatter, ...source };
  }

  function rawTopicValues(value) {
    const values = Array.isArray(value) ? value : [value];
    return values.flatMap((item) => typeof item === "string" ? item.split(",") : []);
  }

  function timestamp(value) {
    if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
    if (typeof value !== "string" || !value.trim()) return 0;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function computedRecency(data, source) {
    return Math.max(
      timestamp(data.updated),
      timestamp(data.created),
      timestamp(source.source_mtime),
      timestamp(source.mtime),
      timestamp(source.file && source.file.mtime)
    );
  }

  function titleFor(data, sourcePath) {
    const title = typeof data.title === "string" ? data.title.trim() : "";
    if (title) return title;
    const name = sourcePath.split("/").pop() || sourcePath;
    return name.replace(/\.md$/i, "") || "Untitled";
  }

  function warning(code, path, message) {
    return { code, path: path || null, message };
  }

  function compareAssets(left, right) {
    return right.recency - left.recency
      || left.title.localeCompare(right.title, "ko")
      || left.path.localeCompare(right.path, "en");
  }

  function labels(registry, kind, value) {
    try {
      if (kind === "domain" && registry.domainLabel) return registry.domainLabel(value);
      if (kind === "topic" && registry.topicLabel) return registry.topicLabel(value);
      if (kind === "resource" && registry.resourceLabel) return registry.resourceLabel(value);
    } catch (_) {
      // Projection remains usable when the optional display layer is not loaded.
    }
    return value;
  }

  function projectSource(source, registry, warnings) {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      warnings.push(warning("malformed_record", null, "Source record must be a plain object."));
      return null;
    }

    const path = recordPath(source);
    if (!path) {
      warnings.push(warning("missing_path", null, "Source record has no safe canonical path."));
      return null;
    }

    const data = metadata(source);
    const type = token(data.type);
    if (!type) {
      warnings.push(warning("missing_type", path, "Source record has no type and was skipped."));
      return null;
    }
    if (registry.SOURCE_TYPE_POLICY.excluded.includes(type)) return null;

    const isKnowledge = registry.SOURCE_TYPE_POLICY.canonical.includes(type)
      || registry.SOURCE_TYPE_POLICY.legacy.includes(type);
    const role = registry.resolveResourceRole(data);
    if (!isKnowledge && !role) return null;

    const rawDomain = data.knowledge_domain;
    const domain = isKnowledge ? registry.normalizeDomain(rawDomain) : role.domain;
    if (isKnowledge && domain === registry.UNCLASSIFIED) {
      warnings.push(warning(
        rawDomain === undefined || rawDomain === null || rawDomain === "" ? "missing_domain" : "invalid_domain",
        path,
        "Knowledge domain projected to unclassified."
      ));
    }

    let topics = [];
    if (isKnowledge) {
      topics = [...registry.normalizeTopics(data.knowledge_topics, domain)];
      const approved = new Set(registry.TOPICS_BY_DOMAIN[domain] || []);
      const rawTopics = rawTopicValues(data.knowledge_topics).map(token).filter(Boolean);
      if (!rawTopics.length) {
        warnings.push(warning("missing_topics", path, "Knowledge topics projected to unclassified."));
      } else if (rawTopics.some((topic) => !approved.has(topic))) {
        warnings.push(warning("invalid_topic", path, "One or more Knowledge topics projected to unclassified."));
      }
    }

    for (const field of ["updated", "created"]) {
      if (data[field] !== undefined && data[field] !== null && data[field] !== "" && timestamp(data[field]) === 0) {
        warnings.push(warning("invalid_recency", path, `${field} could not be parsed; source mtime was used.`));
      }
    }

    return {
      path,
      title: titleFor(data, path),
      type,
      kind: isKnowledge ? "knowledge" : "resource",
      legacy: registry.SOURCE_TYPE_POLICY.legacy.includes(type),
      domain,
      topics,
      resource_section: role ? role.section : null,
      recency: computedRecency(data, source)
    };
  }

  function topicSections(domain, knowledge, registry) {
    const approved = registry.TOPICS_BY_DOMAIN[domain] || [];
    const hasUnclassified = knowledge.some((asset) => asset.topics.includes(registry.UNCLASSIFIED));
    const keys = hasUnclassified ? [...approved, registry.UNCLASSIFIED] : [...approved];
    return keys.map((key) => {
      const assets = knowledge.filter((asset) => asset.topics.includes(key)).sort(compareAssets);
      return {
        key,
        label: labels(registry, "topic", key),
        count: assets.length,
        recency: assets.reduce((latest, asset) => Math.max(latest, asset.recency), 0),
        assets
      };
    });
  }

  function resourceSections(domain, resources, registry) {
    const roles = Object.entries(registry.RESOURCE_ROLES);
    return roles.flatMap(([type, role]) => {
      const assets = resources.filter((asset) => asset.domain === domain && asset.type === type).sort(compareAssets);
      const fixedDomain = role.domain || null;
      if (fixedDomain && fixedDomain !== domain) return [];
      return [{
        key: role.section,
        type,
        label: labels(registry, "resource", type),
        count: assets.length,
        recency: assets.reduce((latest, asset) => Math.max(latest, asset.recency), 0),
        assets
      }];
    });
  }

  function defaultSelection(domains) {
    const domain = domains.find((item) => item.knowledge.length || item.resources.length) || domains[0];
    if (!domain) return { domain: null, section_kind: null, section_key: null, asset_path: null };
    const topic = domain.topic_sections.find((section) => section.count > 0);
    const resource = domain.resource_sections.find((section) => section.count > 0);
    const section = topic || resource || domain.topic_sections[0] || domain.resource_sections[0] || null;
    const kind = section && domain.topic_sections.includes(section) ? "topic" : section ? "resource" : null;
    return {
      domain: domain.key,
      section_kind: kind,
      section_key: section ? section.key : null,
      asset_path: section && section.assets.length ? section.assets[0].path : null
    };
  }

  function projectKnowledgeExplorer(sources, registryOverride) {
    const registry = registryOverride || root.KnowledgeExplorerRegistry;
    if (!registry) throw new Error("KnowledgeExplorerRegistry is required");
    const warnings = [];
    const records = Array.isArray(sources) ? sources : [];
    if (!Array.isArray(sources)) {
      warnings.push(warning("malformed_input", null, "Sources must be an array; an empty projection was returned."));
    }

    const assets = [];
    const paths = new Set();
    for (const source of records) {
      const asset = projectSource(source, registry, warnings);
      if (!asset) continue;
      const pathKey = asset.path.toLocaleLowerCase("en-US");
      if (paths.has(pathKey)) {
        warnings.push(warning("duplicate_path", asset.path, "Duplicate canonical path was skipped."));
        continue;
      }
      paths.add(pathKey);
      assets.push(asset);
    }
    assets.sort(compareAssets);

    const knowledge = assets.filter((asset) => asset.kind === "knowledge");
    const resources = assets.filter((asset) => asset.kind === "resource");
    const domainKeys = [...registry.DOMAIN_ORDER, registry.UNCLASSIFIED];
    const domains = domainKeys.map((key) => {
      const domainKnowledge = knowledge.filter((asset) => asset.domain === key).sort(compareAssets);
      const domainResources = resources.filter((asset) => asset.domain === key).sort(compareAssets);
      return {
        key,
        label: labels(registry, "domain", key),
        count: domainKnowledge.length,
        resource_count: domainResources.length,
        recency: [...domainKnowledge, ...domainResources].reduce((latest, asset) => Math.max(latest, asset.recency), 0),
        knowledge: domainKnowledge,
        resources: domainResources,
        topic_sections: topicSections(key, domainKnowledge, registry),
        resource_sections: resourceSections(key, domainResources, registry)
      };
    });

    warnings.sort((left, right) => (left.path || "").localeCompare(right.path || "", "en")
      || left.code.localeCompare(right.code, "en")
      || left.message.localeCompare(right.message, "en"));

    return {
      schema_version: SCHEMA_VERSION,
      domains,
      assets,
      totals: { knowledge: knowledge.length, resources: resources.length, warnings: warnings.length },
      recency: assets.reduce((latest, asset) => Math.max(latest, asset.recency), 0),
      selection: defaultSelection(domains),
      warnings
    };
  }

  const api = Object.freeze({ SCHEMA_VERSION, canonicalPath, projectKnowledgeExplorer });
  root.KnowledgeExplorerCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
