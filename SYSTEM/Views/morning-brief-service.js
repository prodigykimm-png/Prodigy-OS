(function (root) {
  "use strict";

  const MORNING_RESULT_SCHEMA = {
    type: "object",
    properties: {
      schema_version: { type: "string" },
      result_id: { type: "string" },
      generated_at: { type: "string" },
      brief: { type: "string" },
      principle: {
        type: "object",
        properties: {
          label: { type: "string" },
          source: { type: "string", enum: ["validated", "suggested", "fallback"] },
          reason: { type: "string" }
        },
        required: ["label", "source", "reason"]
      },
      focus: {
        type: "array",
        maxItems: 3,
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            label: { type: "string" },
            reason: { type: "string" },
            object_path: { type: "string" },
            source_type: { type: "string", enum: ["project", "auction", "reading", "health", "calendar", "review"] },
            urgency: { type: "string", enum: ["high", "medium", "low"] }
          },
          required: ["id", "label", "reason", "source_type", "urgency"]
        }
      },
      attention: {
        type: "array",
        items: {
          type: "object",
          properties: {
            label: { type: "string" },
            reason: { type: "string" },
            object_path: { type: "string" }
          },
          required: ["label", "reason"]
        }
      },
      limitations: {
        type: "array",
        items: { type: "string" }
      }
    },
    required: ["schema_version", "result_id", "generated_at", "brief", "principle", "focus", "attention", "limitations"]
  };

  function fetchWithTimeout(url, options, ms = 5000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`API request timed out (${ms}ms limit reached).`));
      }, ms);
      fetch(url, options).then(
        (res) => {
          clearTimeout(timer);
          resolve(res);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        }
      );
    });
  }

  async function getSecret(app, name) {
    if (!name || !app || !app.secretStorage || typeof app.secretStorage.getSecret !== "function") return "";
    try {
      const p = Promise.resolve(app.secretStorage.getSecret(name));
      return await new Promise((resolve) => {
        const timer = setTimeout(() => resolve(""), 1000);
        p.then(
          (val) => {
            clearTimeout(timer);
            resolve(val || "");
          },
          () => {
            clearTimeout(timer);
            resolve("");
          }
        );
      });
    } catch (_err) {
      return "";
    }
  }

  async function getProviderSecret(app, provider) {
    const current = await getSecret(app, provider.apiKeySecret);
    if (current) return current;
    if (provider.legacyApiKeySecret) return getSecret(app, provider.legacyApiKeySecret);
    return "";
  }

  function validateMorningResult(result) {
    if (!result || typeof result !== "object") throw new Error("Result must be a JSON object.");
    
    // Normalize properties
    result.schema_version = result.schema_version || "morning-result-v1";
    result.result_id = result.result_id || `morning-result-${Date.now()}`;
    result.generated_at = result.generated_at || new Date().toISOString();
    
    if (typeof result.brief !== "string") throw new Error("Result is missing 'brief' string.");
    if (!result.principle || typeof result.principle !== "object") throw new Error("Result is missing 'principle' object.");
    if (typeof result.principle.label !== "string") throw new Error("Principle must have a 'label' string.");
    
    if (!Array.isArray(result.focus)) throw new Error("Result is missing 'focus' array.");
    
    // Normalize focus item limits
    if (result.focus.length > 3) {
      result.focus = result.focus.slice(0, 3);
    }
    
    // Validate each focus item
    result.focus.forEach((item, index) => {
      if (!item.id) item.id = `focus_${index}`;
      if (!item.label) throw new Error(`Focus item at index ${index} is missing 'label'.`);
      if (!item.reason) throw new Error(`Focus item '${item.label}' is missing a reason.`);
      if (!item.source_type) item.source_type = "health";
      if (!item.urgency) item.urgency = "medium";
      
      // Investment recommendation guard
      if (item.source_type === "auction") {
        const text = (item.label + " " + item.reason).toLowerCase();
        if (text.includes("입찰하세요") || text.includes("포기하세요") || text.includes("이 물건이 좋습니다") || text.includes("추천합니다")) {
          throw new Error("AI generated investment recommendation which is forbidden.");
        }
      }
    });

    if (!Array.isArray(result.attention)) result.attention = [];
    if (!Array.isArray(result.limitations)) result.limitations = [];
    
    return result;
  }

  function buildPrompt(morningPackage) {
    return [
      "You are the Morning Brief AI for Prodigy OS.",
      "Analyze the provided Morning Package JSON and generate Today's Brief, Focus, Principle, Attention items and Limitations.",
      "Return ONLY JSON matching the requested schema.",
      "All text in brief, focus labels/reasons, and principles MUST be written in Korean.",
      "",
      "--- Today's Brief Writing Style Rules ---",
      "- Tone: Factual, calm, and professional Korean natural language. Act as a silent, efficient executive assistant.",
      "- Strictly avoid motivational language, exaggerated wording, or unnecessary politeness (e.g. do NOT say '화이팅', '오늘도 힘차게', etc.).",
      "- Keep the 'brief' text concise, containing a maximum of 5 short sentences.",
      "- Write using clear line breaks for readability. Report objective facts and upcoming deadlines directly.",
      "- Example Style:",
      "  오늘은 입찰 예정 물건이 1건 있습니다.",
      "  현재 가장 중요한 리스크는 임장 정보가 아직 충분하지 않다는 점입니다.",
      "  운송예산 프로젝트는 이번 주 마감입니다.",
      "  추천 Focus는 아래와 같습니다.",
      "- Avoid generic AI greetings or large paragraphs.",
      "",
      "--- Focus Rules ---",
      "- Generate maximum 3 Focus items.",
      "- Focus items must be high-level actionable directions (not individual task checklists).",
      "- Each Focus item MUST have an evidence-based 'reason' (why it is critical today).",
      "- Focus items source_type MUST be one of: 'project', 'auction', 'reading', 'health', 'calendar', 'review'.",
      "- Focus items urgency MUST be: 'high', 'medium', or 'low'.",
      "- Do NOT make investment recommendations for Auction Objects. You can say '입찰일이 임박했습니다' or '필수 근거가 누락되었습니다', but NEVER say '입찰하세요', '포기하세요', or '이 물건이 좋습니다'.",
      "",
      "--- Yesterday Recovery Rules ---",
      "- If context.yesterday_review has change or next_experiment, incorporate them into the brief in 1 short line each (어제 변화 / 오늘 실험).",
      "- Prefer surfacing next_experiment as something to continue today when relevant, without inventing new experiments.",
      "",
      "--- Today's Principle Rules ---",
      "- Select a single core Principle relevant to today's context.",
      "- Priority: (1) Use suggested/validated principles from latest_review if relevant, (2) Fallback to conservative principles like '근거를 먼저 확인하고 판단한다', '가장 중요한 일부터 끝낸다', or '실행 후서는 짧게라도 복기한다'.",
      "- Set the principle source as 'validated', 'suggested', or 'fallback'.",
      "",
      "--- JSON Schema ---",
      JSON.stringify(MORNING_RESULT_SCHEMA, null, 2),
      "",
      "--- Morning Package Input ---",
      JSON.stringify(morningPackage, null, 2)
    ].join("\n");
  }

  async function openAiCompatibleMorningAdapter(args) {
    const provider = args.provider;
    if (!provider.baseURL) throw new Error(`${provider.name || "Provider"} baseURL is not configured.`);
    if (!provider.model) throw new Error(`${provider.name || "Provider"} model is not configured.`);
    const apiKey = await getProviderSecret(args.app, provider);
    if (!apiKey) throw new Error(`${provider.name || "Provider"} API key is not configured.`);
    
    const prompt = buildPrompt(args.morningPackage);
    const body = {
      model: provider.model,
      stream: false,
      messages: [
        { role: "system", content: "You return strict JSON only." },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" }
    };
    
    const draftService = root.ProjectWorkflowDraftService;
    const url = `${String(provider.baseURL).replace(/\/$/, "")}${provider.endpointPath || "/chat/completions"}`;
    const headers = { "Content-Type": "application/json" };
    if (provider.authMode === "api-key") {
      headers[provider.apiKeyHeader || "api-key"] = apiKey;
    } else {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const rawResponse = await fetchWithTimeout(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: args.signal
    }, 5000).then(r => r.json());

    const text = draftService.extractJsonText(rawResponse);
    return parseMorningResponse(text);
  }

  async function geminiMorningAdapter(args) {
    const provider = args.provider;
    if (!provider.model) throw new Error("Gemini model is not configured.");
    const apiKey = await getProviderSecret(args.app, provider);
    if (!apiKey) throw new Error("Gemini API key is not configured.");
    
    const prompt = buildPrompt(args.morningPackage);
    const body = {
      model: provider.model,
      input: prompt,
      response_format: {
        type: "text",
        mime_type: "application/json"
      }
    };
    
    const url = provider.endpointURL || "https://generativelanguage.googleapis.com/v1beta/interactions";
    const headers = {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    };
    
    const draftService = root.ProjectWorkflowDraftService;
    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: args.signal
    }, 5000).then(r => r.json());

    const text = draftService.extractJsonText(response);
    return parseMorningResponse(text);
  }

  function parseMorningResponse(text) {
    const draftService = root.ProjectWorkflowDraftService;
    const json = draftService.parseJsonPayload(text);
    return validateMorningResult(json);
  }

  const adapters = {
    "openai-compatible": openAiCompatibleMorningAdapter,
    gemini: geminiMorningAdapter
  };

  async function generateMorningResult(options) {
    const app = options.app;
    const morningPackage = options.morningPackage;
    if (!morningPackage) throw new Error("Morning package is required.");
    
    const draftService = root.ProjectWorkflowDraftService;
    if (!draftService) throw new Error("ProjectWorkflowDraftService is not loaded.");
    
    const config = options.config || await draftService.loadProviderConfig(app);
    const providerKey = options.providerKey || config.defaultProvider;
    const provider = config.providers[providerKey];
    if (!provider) throw new Error(`Unknown provider: ${providerKey}`);
    
    const adapter = adapters[provider.adapter];
    if (!adapter) throw new Error(`Unsupported provider adapter: ${provider.adapter}`);
    
    try {
      return await adapter({
        app,
        provider,
        morningPackage,
        signal: options.signal
      });
    } catch (error) {
      throw new Error(draftService.redactError(error));
    }
  }

  const api = {
    MORNING_RESULT_SCHEMA,
    validateMorningResult,
    buildPrompt,
    generateMorningResult,
    adapters
  };

  root.MorningBriefService = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
