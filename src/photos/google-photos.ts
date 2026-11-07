import type { MonthOption, PhotoItem } from "./types";

const VISIBLE_PHOTO_MIN_SIZE = 80;
const PHOTO_LINK_SELECTOR = 'a[href^="./photo/"], a[href^="/photo/"]';
const MONTH_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: "long",
  year: "numeric",
});
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

type TrashResult = "moved" | "cancelled" | "unavailable" | "unverified";

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

export function collectVisiblePhotos(): PhotoItem[] {
  const candidates = new Set<HTMLElement>();
  const selectors = [
    '[role="gridcell"]',
    PHOTO_LINK_SELECTOR,
    "div[aria-label][tabindex]",
    "div[jsaction][aria-label]",
  ];

  for (const selector of selectors) {
    document.querySelectorAll<HTMLElement>(selector).forEach((element) => {
      const tile = element.matches(PHOTO_LINK_SELECTOR)
        ? element
        : element.querySelector<HTMLElement>(PHOTO_LINK_SELECTOR) ?? element;
      if (findVisualAsset(tile)) candidates.add(tile);
    });
  }

  const seen = new Set<string>();
  return Array.from(candidates)
    .filter(isVisiblePhotoTile)
    .map(toPhotoItem)
    .filter((item): item is PhotoItem => item !== null)
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
}

export function listVisibleMonths(): MonthOption[] {
  const counts = new Map<string, number>();
  for (const photo of collectVisiblePhotos()) {
    counts.set(photo.month, (counts.get(photo.month) ?? 0) + 1);
  }
  return Array.from(counts, ([label, count]) => ({ label, count }));
}

export function hasSelectedPhotos(): boolean {
  return document.querySelector(
    '[role="checkbox"][aria-checked="true"], input[type="checkbox"]:checked',
  ) !== null;
}

export async function setPhotoSelected(
  item: PhotoItem,
  selected: boolean,
): Promise<boolean> {
  const freshTile = findFreshTile(item) ?? item.tile;
  freshTile.scrollIntoView({
    block: "center",
    inline: "center",
    behavior: "auto",
  });
  await wait(120);

  const control = findSelectControl(freshTile);
  if (!control) return false;
  if (isPhotoSelected(control) === selected) return true;

  control.click();
  await wait(120);
  return isPhotoSelected(findSelectControl(freshTile)) === selected;
}

export async function clearPhotoSelection(items: PhotoItem[]): Promise<void> {
  for (const item of items) {
    await setPhotoSelected(item, false);
    await wait(90);
  }
}

export function focusPhoto(item: PhotoItem): void {
  item.tile.scrollIntoView({
    block: "center",
    inline: "center",
    behavior: "smooth",
  });
  flashTile(item.tile);
}

function toPhotoItem(tile: HTMLElement): PhotoItem | null {
  const { image, thumbUrl } = findVisualAsset(tile) ?? {};
  const label = normalizeText(
    tile.getAttribute("aria-label") ??
      image?.getAttribute("aria-label") ??
      image?.alt ??
      nearestTextLabel(tile) ??
      "Visible photo",
  );
  const month = monthFromLabel(label) ?? monthFromNearbyHeading(tile) ??
    "Visible photos";
  const id = [
    tile.getAttribute("data-id"),
    tile.getAttribute("href"),
    label,
    thumbUrl,
    Math.round(tile.getBoundingClientRect().top + window.scrollY),
  ]
    .filter(Boolean)
    .join("|");

  return { id, tile, image, label, month, thumbUrl };
}

function findVisualAsset(
  tile: HTMLElement,
): Pick<PhotoItem, "image" | "thumbUrl"> | null {
  const image = tile.querySelector<HTMLImageElement>("img");
  if (image) {
    return { image, thumbUrl: image.currentSrc || image.src || undefined };
  }

  for (const element of [tile, ...tile.querySelectorAll<HTMLElement>("*")]) {
    const thumbUrl = element.getAttribute("data-latest-bg") ??
      backgroundImageUrl(element);
    if (thumbUrl) return { thumbUrl };
  }
  return null;
}

function backgroundImageUrl(element: HTMLElement): string | undefined {
  const match = getComputedStyle(element).backgroundImage.match(
    /^url\(["']?(.*?)["']?\)$/,
  );
  return match?.[1] || undefined;
}

function findFreshTile(item: PhotoItem): HTMLElement | null {
  return collectVisiblePhotos().find((candidate) =>
    candidate.id === item.id || candidate.label === item.label
  )?.tile ?? null;
}

function findSelectControl(tile: HTMLElement): HTMLElement | null {
  const label = tile.getAttribute("aria-label");
  const local = Array.from(
    tile.parentElement?.querySelectorAll<HTMLElement>('[role="checkbox"]') ??
      [],
  );
  const localMatch = local.find((control) =>
    control.getAttribute("aria-label") === label
  );
  if (localMatch) return localMatch;

  const global = Array.from(
    document.querySelectorAll<HTMLElement>('[role="checkbox"]'),
  );
  const globalMatch = global.find((control) =>
    control.getAttribute("aria-label") === label
  );
  if (globalMatch) return globalMatch;

  const controls = Array.from(
    tile.querySelectorAll<HTMLElement>('button, [role="button"], [aria-label]'),
  );
  return (
    controls.find((control) =>
      /select|check|tick/i.test(control.getAttribute("aria-label") ?? "")
    ) ??
      controls.find((control) => {
        const rect = control.getBoundingClientRect();
        const tileRect = tile.getBoundingClientRect();
        return rect.width > 12 && rect.height > 12 &&
          rect.left < tileRect.left + tileRect.width * 0.45;
      }) ??
      null
  );
}

function isPhotoSelected(control: HTMLElement | null): boolean {
  if (!control) return false;
  if (control.getAttribute("aria-checked") === "true") return true;
  return control instanceof HTMLInputElement && control.checked;
}

function isVisiblePhotoTile(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  if (
    rect.width < VISIBLE_PHOTO_MIN_SIZE || rect.height < VISIBLE_PHOTO_MIN_SIZE
  ) return false;
  if (rect.bottom < 0 || rect.top > window.innerHeight) return false;
  if (rect.right < 0 || rect.left > window.innerWidth) return false;
  return getComputedStyle(element).visibility !== "hidden";
}

function monthFromLabel(label: string): string | null {
  const date = Date.parse(label);
  if (!Number.isNaN(date)) return MONTH_FORMAT.format(new Date(date));

  const match = label.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/i,
  );
  if (!match) return null;

  const matchedDate = Date.parse(match[0]);
  return Number.isNaN(matchedDate)
    ? null
    : MONTH_FORMAT.format(new Date(matchedDate));
}

function monthFromNearbyHeading(tile: HTMLElement): string | null {
  let cursor: Element | null = tile;
  for (let depth = 0; cursor && depth < 6; depth += 1) {
    const heading = cursor.querySelector<HTMLElement>(
      '[role="heading"], h1, h2, h3, [aria-label]',
    );
    const text = normalizeText(
      heading?.textContent ?? heading?.getAttribute("aria-label") ?? "",
    );
    const month = monthFromLabel(text);
    if (month) return month;
    cursor = cursor.parentElement;
  }
  return null;
}

function nearestTextLabel(tile: HTMLElement): string | null {
  const texts: string[] = [];
  let cursor: HTMLElement | null = tile;
  for (let depth = 0; cursor && depth < 4; depth += 1) {
    const text = normalizeText(cursor.innerText);
    if (text && text.length < 120) texts.push(text);
    cursor = cursor.parentElement;
  }
  return texts[0] ?? null;
}

function flashTile(tile: HTMLElement): void {
  const previousOutline = tile.style.outline;
  const previousOffset = tile.style.outlineOffset;
  tile.style.outline = "4px solid #0f766e";
  tile.style.outlineOffset = "2px";
  window.setTimeout(() => {
    tile.style.outline = previousOutline;
    tile.style.outlineOffset = previousOffset;
  }, 600);
}

function normalizeText(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
