import { assertNever } from "./contracts";
import type {
  AssistantDocument,
  AssistantElement,
  AssistantView,
  AssistantViewModel,
  AssistantViewPorts,
} from "./view-model";
import { keyboardMode } from "./view-model";

type ElementOptions = {
  readonly className?: string;
  readonly text?: string;
  readonly attributes?: Readonly<Record<string, string>>;
};

const modes = ["current_document", "whole_vault"] as const;
const actionLabels = {
  submit: "질문 보내기",
  cancel: "취소",
  later: "나중에",
  retry: "다시 시도",
  settings: "AI 설정",
} as const;

function addElement(
  document: AssistantDocument,
  tagName: string,
  options: ElementOptions = {},
): AssistantElement {
  const element = document.createElement(tagName);
  if (options.className !== undefined) element.className = options.className;
  if (options.text !== undefined) element.textContent = options.text;
  for (const [name, value] of Object.entries(options.attributes ?? {})) {
    element.setAttribute(name, value);
  }
  return element;
}

export function createAssistantView(
  document: AssistantDocument,
  ports: AssistantViewPorts,
): AssistantView {
  const root = addElement(document, "section", {
    className: "prodigy-vault-assistant",
    attributes: { "aria-label": "Vault Assistant" },
  });
  const header = addElement(document, "header", { className: "pva-header" });
  const transcript = addElement(document, "main", {
    className: "pva-transcript",
    attributes: {
      id: "pva-transcript",
      role: "tabpanel",
      "data-scroll-owner": "assistant-transcript",
      tabindex: "0",
    },
  });
  const composerArea = addElement(document, "footer", { className: "pva-composer" });
  const composerLabel = addElement(document, "label", {
    text: "질문",
    attributes: { for: "pva-question" },
  });
  const composer = addElement(document, "textarea", {
    attributes: { id: "pva-question", rows: "3", "aria-describedby": "pva-live-status" },
  });
  const composerActions = addElement(document, "div", { className: "pva-actions" });
  composerArea.append(composerLabel, composer, composerActions);
  root.append(header, transcript, composerArea);

  const restoreComposer = (action: () => void): void => {
    action();
    composer.focus();
  };

  const render = (model: AssistantViewModel): void => {
    root.setAttribute("data-state", model.state);
    root.setAttribute("data-evidence-mode", model.evidence?.mode ?? "unknown");
    root.setAttribute("data-error-code", model.errorCode ?? "");
    root.setAttribute("aria-busy", String(model.busy));
    const title = addElement(document, "h2", { text: "Vault Assistant" });
    const provider = addElement(document, "p", {
      className: "pva-provider",
      text: model.providerText,
      attributes: { "aria-label": "상속된 AI 제공자와 모델" },
    });
    const tabs = addElement(document, "div", {
      className: "pva-tabs",
      attributes: { role: "tablist", "aria-label": "질문 범위" },
    });
    for (const mode of modes) {
      const selected = mode === model.mode;
      const tab = addElement(document, "button", {
        text: mode === "current_document" ? "현재 문서" : "전체 Vault",
        attributes: {
          type: "button",
          role: "tab",
          "aria-controls": "pva-transcript",
          "data-mode": mode,
          "aria-selected": String(selected),
          tabindex: selected ? "0" : "-1",
        },
      });
      tab.addEventListener("click", () => ports.onModeChange(mode));
      tab.addEventListener("keydown", (event) => {
        if (!("key" in event) || typeof event.key !== "string") return;
        const targetMode = keyboardMode(mode, event.key);
        if (targetMode === null) return;
        event.preventDefault();
        for (const peer of tabs.querySelectorAll('[role="tab"]')) {
          const active = peer.getAttribute("data-mode") === targetMode;
          peer.setAttribute("aria-selected", String(active));
          peer.setAttribute("tabindex", active ? "0" : "-1");
          if (active) peer.focus();
        }
        ports.onModeChange(targetMode);
      });
      tabs.append(tab);
    }
    const currentDocument = addElement(document, "p", {
      className: "pva-current-document",
      text: model.currentDocumentLabel ?? "선택된 Markdown 문서 없음",
    });
    header.replaceChildren(title, provider, tabs, currentDocument);

    const history = addElement(document, "nav", {
      className: "pva-history",
      attributes: { "aria-label": "최근 대화" },
    });
    for (const item of model.history) {
      const button = addElement(document, "button", {
        text: item.label,
        attributes: { type: "button", "data-history-id": item.id },
      });
      button.addEventListener("click", () => ports.onHistoryOpen(item.id));
      history.append(button);
    }
    const clear = addElement(document, "button", {
      text: "대화 기록 지우기",
      attributes: { type: "button", "data-action": "clear-history" },
    });
    clear.addEventListener("click", () => restoreComposer(ports.onClearHistory));
    history.append(clear);

    const mentions = addElement(document, "div", {
      className: "pva-mentions",
      attributes: { "aria-label": "선택한 문서" },
    });
    for (const mention of model.mentions) {
      const chip = addElement(document, "span", { className: "pva-mention" });
      const remove = addElement(document, "button", {
        text: `${mention.label} 제거`,
        attributes: { type: "button", "data-mention-remove": mention.path },
      });
      remove.addEventListener("click", () =>
        restoreComposer(() => ports.onMentionRemove(mention.path)),
      );
      chip.append(addElement(document, "span", { text: `@${mention.label}` }), remove);
      mentions.append(chip);
    }
    const suggestions = addElement(document, "div", {
      className: "pva-suggestions",
      attributes: { role: "listbox", "aria-label": "문서 제안" },
    });
    for (const suggestion of model.mentionSuggestions) {
      const option = addElement(document, "button", {
        text: suggestion.label,
        attributes: {
          type: "button",
          role: "option",
          "aria-selected": "false",
          "data-mention-suggestion": suggestion.path,
        },
      });
      option.addEventListener("click", () =>
        restoreComposer(() => ports.onMentionSelect(suggestion.path)),
      );
      suggestions.append(option);
    }

    const answers = addElement(document, "section", {
      className: "pva-answers",
      attributes: { "aria-label": "답변" },
    });
    for (const block of model.blocks) {
      const content = addElement(document, block.kind === "paragraph" ? "p" : "li", {
        attributes: { "data-answer-block": block.kind },
      });
      for (const part of block.text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/u)) {
        if (part.length === 0) continue;
        const code = part.startsWith("`") && part.endsWith("`");
        const strong = part.startsWith("**") && part.endsWith("**");
        content.append(
          addElement(document, code ? "code" : strong ? "strong" : "span", {
            text: code ? part.slice(1, -1) : strong ? part.slice(2, -2) : part,
          }),
        );
      }
      if (block.kind === "paragraph") answers.append(content);
      else {
        const list = addElement(document, "ul");
        list.append(content);
        answers.append(list);
      }
    }
    const sources = addElement(document, "section", {
      className: "pva-sources",
      attributes: { "aria-label": "근거 문서" },
    });
    for (const source of model.sources) {
      const button = addElement(document, "button", {
        text: source.label,
        attributes: { type: "button", "data-source-status": source.status },
      });
      if (source.enabled) {
        button.setAttribute("data-source-path", source.path);
        button.addEventListener("click", () => {
          ports.onSourceOpen(source.path, source.heading);
          composer.focus();
        });
      } else {
        button.setAttribute("disabled", "");
        button.setAttribute("aria-disabled", "true");
      }
      sources.append(button);
    }
    const statusRole = model.statusKind === "error" ? "alert" : "status";
    const statusText =
      model.coverageText === null ? model.statusText : `${model.statusText} ${model.coverageText}`;
    const status = addElement(document, "p", {
      className: `pva-status is-${model.statusKind}`,
      text: statusText,
      attributes: {
        id: "pva-live-status",
        role: statusRole,
        "aria-live": "polite",
        "data-selected-chunks": String(model.evidence?.selectedChunks ?? 0),
        "data-total-chunks": String(model.evidence?.totalChunks ?? 0),
      },
    });
    transcript.replaceChildren(history, mentions, suggestions, answers, sources, status);

    composerActions.replaceChildren();
    for (const action of model.actions) {
      const button = addElement(document, "button", {
        text: actionLabels[action],
        attributes: { type: "button", "data-action": action },
      });
      button.addEventListener("click", () => {
        switch (action) {
          case "submit":
            ports.onSubmit(composer.value ?? composer.textContent);
            return;
          case "cancel":
            restoreComposer(ports.onCancel);
            return;
          case "later":
            restoreComposer(ports.onLater);
            return;
          case "retry":
            restoreComposer(ports.onRetry);
            return;
          case "settings":
            restoreComposer(ports.onSettings);
            return;
          default:
            return assertNever(action);
        }
      });
      composerActions.append(button);
    }
  };

  return { root, composer, render };
}
