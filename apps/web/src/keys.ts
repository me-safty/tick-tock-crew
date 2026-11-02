const TEXT_INPUTS = new Set(["text", "search", "email", "url", "tel", "password", "number"])

/** Whether a key press is typing into a text field, which shortcuts must leave alone. Sliders and buttons aren't. */
export const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLInputElement && TEXT_INPUTS.has(target.type)))

export const hasModifier = (event: KeyboardEvent) => event.ctrlKey || event.metaKey || event.altKey
