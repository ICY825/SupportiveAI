export const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

/** True when the key event comes from a text field, where single-key shortcuts must not fire. */
export const isTypingTarget = (t: EventTarget | null) =>
  t instanceof Element && Boolean(t.closest('input, textarea, select, [contenteditable]'))
