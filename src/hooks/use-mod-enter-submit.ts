import { useEffect } from "react";

/**
 * App-wide ⌘/Ctrl+Enter = "submit whatever I'm looking at".
 *
 * Resolution order:
 *  1. Inside an open dialog (the top-most one): an explicit `[data-mod-enter]` button,
 *     else the form the focus is in, else the last button of the dialog footer
 *     (footers put the primary action last).
 *  2. No dialog: the form the focus is in, else the `[data-mod-enter]` button nearest the focus.
 *
 * Pages with their own ⌘+Enter handling (e.g. Send) call `preventDefault()` and win,
 * because their listeners register before this one.
 */
const FOOTER = '[data-slot="dialog-footer"]';

function usable(el: Element | null | undefined): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if ((el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true")
    return false;
  return el.getClientRects().length > 0; // visible
}

function lastUsable(els: Iterable<Element>): HTMLElement | null {
  const arr = Array.from(els).filter(usable);
  return arr.length ? arr[arr.length - 1] : null;
}

function submitForm(form: HTMLFormElement | null | undefined): boolean {
  if (!form) return false;
  form.requestSubmit();
  return true;
}

function handleModEnter(): boolean {
  const active = document.activeElement as HTMLElement | null;
  const dialogs = Array.from(
    document.querySelectorAll<HTMLElement>(
      '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
    ),
  );
  const dialog =
    (active && dialogs.find((d) => d.contains(active))) ?? dialogs[dialogs.length - 1] ?? null;

  if (dialog) {
    const explicit = lastUsable(dialog.querySelectorAll("[data-mod-enter]"));
    if (explicit) return (explicit.click(), true);
    const form = active?.closest("form");
    if (form && dialog.contains(form)) return submitForm(form);
    const footers = dialog.querySelectorAll(FOOTER);
    const footer = footers[footers.length - 1];
    const primary = footer ? lastUsable(footer.querySelectorAll("button, a[href]")) : null;
    if (primary) return (primary.click(), true);
    return false;
  }

  if (submitForm(active?.closest("form"))) return true;
  // Nearest `[data-mod-enter]` to the focus (pages can have several sections), else the page's only one.
  for (let n = active; n && n !== document.body; n = n.parentElement) {
    const hit = lastUsable(n.querySelectorAll("[data-mod-enter]"));
    if (hit) return (hit.click(), true);
  }
  const all = Array.from(document.querySelectorAll("[data-mod-enter]")).filter(usable);
  if (all.length === 1) return (all[0].click(), true);
  return false;
}

export function useModEnterSubmit() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.isComposing) return;
      if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      if (handleModEnter()) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
