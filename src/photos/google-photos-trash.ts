import { hasSelectedPhotos } from "./google-photos";

const BUTTON_SELECTOR = 'button, [role="button"]';
const DIALOG_SELECTOR = '[role="dialog"], [role="alertdialog"], dialog[open]';
const TRASH_LABELS = new Set([
  "delete",
  "move to trash",
  "move to bin",
  "supprimer",
  "placer dans la corbeille",
  "mettre à la corbeille",
  "déplacer dans la corbeille",
  "déplacer vers la corbeille",
]);

export type TrashResult = "moved" | "cancelled" | "unavailable" | "unverified";

export function hasOpenPhotosDialog(): boolean {
  return visibleDialogs().length > 0;
}

export function moveSelectedPhotosToTrash(signal: AbortSignal): Promise<TrashResult> {
  if (signal.aborted) return Promise.resolve("cancelled");
  const buttons = Array.from(document.querySelectorAll<HTMLElement>(BUTTON_SELECTOR))
    .filter((button) => !button.closest(DIALOG_SELECTOR) && isTrashButton(button));
  const button = buttons[0];
  if (hasOpenPhotosDialog() || buttons.length !== 1 || !button) {
    return Promise.resolve("unavailable");
  }

  return new Promise((resolve) => {
    let dialog: HTMLElement | undefined;
    let confirmed = false;
    let timeout: number | undefined;

    const finish = (result: TrashResult) => {
      window.clearTimeout(timeout);
      observer.disconnect();
      document.removeEventListener("click", onClick, true);
      signal.removeEventListener("abort", onAbort);
      resolve(result);
    };
    const inspect = () => {
      if (!dialog) {
        dialog = visibleDialogs().find((candidate) =>
          Array.from(candidate.querySelectorAll<HTMLElement>(BUTTON_SELECTOR)).some(isTrashButton)
        );
        if (dialog) window.clearTimeout(timeout);
      }
      if (!dialog || dialog.checkVisibility({ visibilityProperty: true })) return;
      if (!confirmed) {
        finish("cancelled");
      } else if (!hasSelectedPhotos() && !isTrashButton(button)) {
        finish("moved");
      }
    };
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || !dialog?.contains(event.target)) return;
      const control = event.target.closest<HTMLElement>(BUTTON_SELECTOR);
      if (!control || !isTrashButton(control)) return;
      confirmed = true;
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => finish("unverified"), 10000);
    };
    const onAbort = () => finish("cancelled");
    const observer = new MutationObserver(inspect);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    document.addEventListener("click", onClick, true);
    signal.addEventListener("abort", onAbort, { once: true });
    timeout = window.setTimeout(() => finish("unverified"), 3000);
    button.click();
    inspect();
  });
}

function visibleDialogs(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(DIALOG_SELECTOR))
    .filter((dialog) => dialog.checkVisibility({ visibilityProperty: true }));
}

function isTrashButton(button: HTMLElement): boolean {
  const label = normalizeText(
    button.getAttribute("aria-label") ?? button.getAttribute("data-tooltip") ??
      button.getAttribute("title") ?? button.textContent,
  ).toLowerCase();
  return TRASH_LABELS.has(label) && button.checkVisibility({ visibilityProperty: true }) &&
    !button.matches(':disabled, [aria-disabled="true"]');
}


function normalizeText(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}
