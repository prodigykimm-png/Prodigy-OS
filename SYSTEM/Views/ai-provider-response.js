(function (root) {
  "use strict";

  function extractJsonText(response) {
    if (!response) return "";
    if (typeof response === "string") return response;
    if (typeof response.output_text === "string") return response.output_text;
    if (typeof response.text === "string") return response.text;
    const chunks = [];
    const collectContent = (content) => {
      (Array.isArray(content) ? content : []).forEach((part) => {
        if (part && typeof part.text === "string") chunks.push(part.text);
      });
    };
    (Array.isArray(response.outputs) ? response.outputs : []).forEach((item) => {
      if (item && typeof item.text === "string") chunks.push(item.text);
      collectContent(item && item.content);
    });
    (Array.isArray(response.steps) ? response.steps : []).forEach((step) => {
      if (step && (!step.type || step.type === "model_output")) collectContent(step.content);
    });
    (Array.isArray(response.output) ? response.output : []).forEach((item) => collectContent(item && item.content));
    if (chunks.length) return chunks.join("\n");
    if (Array.isArray(response.choices) && response.choices[0]) {
      const message = response.choices[0].message || {};
      const content = message.content;
      if (typeof content === "string" && content.trim()) return content;
      collectContent(content);
      if (chunks.length) return chunks.join("\n");
      const reasoningContent = typeof message.reasoning_content === "string" ? message.reasoning_content.trim() : "";
      if (reasoningContent.startsWith("{") && reasoningContent.endsWith("}")) return reasoningContent;
    }
    if (Array.isArray(response.candidates) && response.candidates[0]) {
      collectContent(((response.candidates[0].content || {}).parts || []));
    }
    return chunks.join("\n");
  }

  function parseJsonPayload(text) {
    const raw = String(text || "").trim();
    if (!raw) throw new Error("Provider returned an empty response.");
    try { return JSON.parse(raw); } catch (_error) {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("Provider did not return valid JSON.");
      return JSON.parse(match[0]);
    }
  }

  const api = { extractJsonText, parseJsonPayload };
  root.AIProviderResponse = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
