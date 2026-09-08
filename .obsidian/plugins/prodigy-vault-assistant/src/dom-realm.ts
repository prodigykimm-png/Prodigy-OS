import type { AssistantDocument } from "./view-model";

type NodeRealm<NodeType extends object> = {
  readonly defaultView: {
    readonly Node: abstract new (...args: never[]) => NodeType;
  } | null;
};

function isAssistantDocument(value: unknown): value is AssistantDocument {
  return (
    typeof value === "object" &&
    value !== null &&
    "activeElement" in value &&
    "createElement" in value &&
    typeof value.createElement === "function"
  );
}

export function assistantDocument(value: unknown): AssistantDocument {
  if (isAssistantDocument(value)) return value;
  throw new TypeError("Obsidian document boundary is unavailable");
}

export function nodeFromDocument<NodeType extends object>(
  value: unknown,
  ownerDocument: NodeRealm<NodeType>,
): NodeType | null {
  const NodeConstructor = ownerDocument.defaultView?.Node;
  return NodeConstructor !== undefined && value instanceof NodeConstructor ? value : null;
}
