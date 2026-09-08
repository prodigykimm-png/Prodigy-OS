import type { AssistantDocument, AssistantElement } from "../../src/view-model";

type Listener = (event: Event) => void;

class TestKeyboardEvent extends Event {
  constructor(readonly key: string) {
    super("keydown", { bubbles: true, cancelable: true });
  }
}

export function keydown(key: string): Event {
  return new TestKeyboardEvent(key);
}

export class TestElement implements AssistantElement {
  readonly children: AssistantElement[] = [];
  readonly tagName: string;
  className = "";
  value = "";
  private ownText = "";
  private readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, Listener[]>();

  constructor(
    tagName: string,
    private readonly owner: TestDocument,
  ) {
    this.tagName = tagName.toUpperCase();
  }

  get textContent(): string {
    return `${this.ownText}${this.children.map((child) => child.textContent).join("")}`;
  }

  set textContent(value: string) {
    this.ownText = value;
  }

  append(...nodes: readonly AssistantElement[]): void {
    this.children.push(...nodes);
  }

  replaceChildren(...nodes: readonly AssistantElement[]): void {
    this.children.splice(0, this.children.length, ...nodes);
    this.ownText = "";
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
    if (name === "class") this.className = value;
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type: string, listener: Listener): void {
    const current = this.listeners.get(type) ?? [];
    current.push(listener);
    this.listeners.set(type, current);
  }

  dispatchEvent(event: Event): boolean {
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
    return !event.defaultPrevented;
  }

  click(): void {
    this.dispatchEvent(new Event("click"));
  }

  focus(): void {
    this.owner.activeElement = this;
  }

  querySelector(selector: string): AssistantElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): readonly AssistantElement[] {
    const result: AssistantElement[] = [];
    for (const child of this.children) {
      if (this.matches(child, selector)) result.push(child);
      result.push(...child.querySelectorAll(selector));
    }
    return result;
  }

  private matches(element: AssistantElement, selector: string): boolean {
    const tag = selector.match(/^[a-z]+/i)?.[0];
    if (tag !== undefined && element.tagName !== tag.toUpperCase()) return false;
    const className = selector.match(/\.([\w-]+)/)?.[1];
    if (className !== undefined && !element.className.split(/\s+/u).includes(className))
      return false;
    for (const match of selector.matchAll(/\[([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]+)))?\]/g)) {
      const name = match[1];
      if (name === undefined) return false;
      const actual = element.getAttribute(name);
      const expected = match[2] ?? match[3] ?? match[4];
      if (actual === null || (expected !== undefined && actual !== expected)) return false;
    }
    return true;
  }
}

export class TestDocument implements AssistantDocument {
  activeElement: AssistantElement | null = null;

  createElement(tagName: string): AssistantElement {
    return new TestElement(tagName, this);
  }
}
