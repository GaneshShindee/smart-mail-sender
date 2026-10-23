import * as React from "react";

/**
 * Makes the device / browser back button close an open overlay (dialog, sheet, alert)
 * instead of navigating away — on mobile (especially an installed PWA) back would
 * otherwise leave the page or exit the app entirely.
 *
 * While open, a same-URL history entry tagged with an overlay id is pushed. Back pops it
 * and closes only the top-most overlay (nested dialogs close one at a time). Closing via
 * the UI removes the entry again with history.back().
 */
const STATE_KEY = "__overlay";
const stack: string[] = [];
let ignorePops = 0;
let listening = false;
const closers = new Map<string, () => void>();

function onPopState() {
  if (ignorePops > 0) {
    ignorePops--;
    return;
  }
  const top = stack.pop();
  if (top) closers.get(top)?.();
}

export function useBackToClose(open: boolean, onClose: () => void) {
  const id = React.useId();
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;

  React.useEffect(() => {
    if (!open || typeof window === "undefined") return;
    if (!listening) {
      window.addEventListener("popstate", onPopState);
      listening = true;
    }
    closers.set(id, () => onCloseRef.current());
    stack.push(id);
    window.history.pushState(
      { ...(window.history.state ?? {}), [STATE_KEY]: id },
      "",
      window.location.href,
    );

    return () => {
      closers.delete(id);
      const idx = stack.indexOf(id);
      // Still in the stack → closed via the UI (not back). Drop our history entry, but only
      // if we're still on it — if a link navigated away meanwhile, going back would undo that.
      if (idx !== -1) {
        stack.splice(idx, 1);
        if (window.history.state?.[STATE_KEY] === id) {
          ignorePops++;
          window.history.back();
        }
      }
    };
  }, [open, id]);
}

/** Wraps a Radix dialog-style Root so it closes on back, controlled or uncontrolled. */
export function withBackToClose<
  P extends { open?: boolean; defaultOpen?: boolean; onOpenChange?: (o: boolean) => void },
>(Root: React.ComponentType<P>) {
  function BackClosableRoot(props: P) {
    const { open: openProp, defaultOpen, onOpenChange } = props;
    const [uncontrolled, setUncontrolled] = React.useState(defaultOpen ?? false);
    const controlled = openProp !== undefined;
    const open = controlled ? openProp : uncontrolled;

    const handleOpenChange = React.useCallback(
      (o: boolean) => {
        if (!controlled) setUncontrolled(o);
        onOpenChange?.(o);
      },
      [controlled, onOpenChange],
    );

    useBackToClose(!!open, () => handleOpenChange(false));

    return React.createElement(Root, { ...props, open, onOpenChange: handleOpenChange });
  }
  BackClosableRoot.displayName = `BackClosable(${Root.displayName ?? Root.name ?? "Root"})`;
  return BackClosableRoot;
}
