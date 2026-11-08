import type { PhotoItem, StartOption } from "./types";

const PHOTO_LINK_SELECTOR = 'a[href*="/photo/"]';

export function isPhotosTimeline(): boolean {
  return location.protocol === "file:" || /^\/(?:u\/\d+\/?)?$/.test(location.pathname);
}

export function timelineScroller(): HTMLElement {
  const photo = document.querySelector<HTMLElement>(PHOTO_LINK_SELECTOR);
  for (let node = photo?.parentElement; node; node = node.parentElement) {
    if (node.scrollHeight > node.clientHeight && /auto|scroll/.test(getComputedStyle(node).overflowY)) {
      return node;
    }
  }
  const main = document.querySelector<HTMLElement>('[role="main"]');
  if (main && /auto|scroll/.test(getComputedStyle(main).overflowY)) return main;
  if (document.scrollingElement instanceof HTMLElement) return document.scrollingElement;
  return document.documentElement;
}

export function readPhotos(root = timelineScroller(), visibleOnly = false): PhotoItem[] {
  const bounds = root === document.scrollingElement
    ? { top: 0, bottom: innerHeight }
    : root.getBoundingClientRect();
  const seen = new Set<string>();
  return Array.from(root.querySelectorAll<HTMLAnchorElement>(PHOTO_LINK_SELECTOR))
    .filter((tile) => {
      const rect = tile.getBoundingClientRect();
      return rect.width >= 40 && rect.height >= 40 && tile.checkVisibility({ visibilityProperty: true }) &&
        (!visibleOnly || (rect.bottom > bounds.top && rect.top < bounds.bottom));
    })
    .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top ||
      a.getBoundingClientRect().left - b.getBoundingClientRect().left)
    .flatMap((tile) => {
      const id = new URL(tile.href).pathname;
      if (seen.has(id)) return [];
      const image = tile.querySelector<HTMLImageElement>("img");
      const label = normalizeText(tile.getAttribute("aria-label") ?? image?.alt ?? "");
      if (!label) return [];
      seen.add(id);
      let thumbUrl = image?.currentSrc || image?.src;
      if (!thumbUrl) {
        for (const element of [tile, ...tile.querySelectorAll<HTMLElement>("*")]) {
          thumbUrl = element.getAttribute("data-latest-bg") ??
            getComputedStyle(element).backgroundImage.match(/^url\(["']?(.*?)["']?\)$/)?.[1];
          if (thumbUrl) break;
        }
      }
      const photo: PhotoItem = {
        ...(/^(?:video|vidéo)\b/iu.test(label)
          ? { kind: "video", videoUrl: videoUrlFromThumbnail(thumbUrl) }
          : { kind: "photo" }),
        id, label, thumbUrl, takenAt: photoDate(label),
        scrollTop: Math.max(0, root.scrollTop + tile.getBoundingClientRect().top - bounds.top - root.clientHeight * 0.25),
      };
      return [photo];
    });
}

function videoUrlFromThumbnail(thumbUrl: string | undefined): string | null {
  if (!thumbUrl) return null;
  try {
    const url = new URL(thumbUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
      !(url.hostname === "photos.fife.usercontent.google.com" || /^lh\d+\.googleusercontent\.com$/.test(url.hostname))) return null;
    url.pathname = url.pathname.replace(/(?:=[^/]*)?$/, "=dv");
    return url.href;
  } catch {
    return null;
  }
}

export function photoDate(label: string): number | null {
  const dateLabel = (label.split(/\s[-–]\s/).reverse().find((part) => /\b(?:19|20)\d{2}\b/.test(part)) ?? label)
    .replace(/[\u202f\u00a0]/g, " ");
  const parsed = Date.parse(dateLabel);
  if (Number.isFinite(parsed)) return parsed;
  const french = dateLabel.toLowerCase().match(/(\d{1,2})\s+([\p{L}.]+)\s+(\d{4})/u);
  if (!french) return null;
  for (let month = 0; month < 12; month += 1) {
    const date = new Date(2000, month, 1);
    const names = ["long", "short"].map((style) =>
      new Intl.DateTimeFormat("fr", { month: style === "long" ? "long" : "short" }).format(date).replace(/\.$/, "")
    );
    if (names.includes(french[2]?.replace(/\.$/, "") ?? "")) {
      return new Date(Number(french[3]), month, Number(french[1]), 12).getTime();
    }
  }
  return null;
}

export function startOptions(now = new Date()): StartOption[] {
  const years = Array.from(document.querySelectorAll('[role="slider"][aria-valuetext]'))
    .flatMap((slider) => slider.textContent?.match(/\b(?:19|20)\d{2}\b/g) ?? []).map(Number);
  const oldestYear = years.length ? Math.min(...years) : now.getFullYear() - 10;
  const options: StartOption[] = [{ value: "now", label: "Now", before: Infinity }];
  for (let date = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    date.getFullYear() >= oldestYear;
    date = new Date(date.getFullYear(), date.getMonth() - 1, 1)) {
    options.push({
      value: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(date),
      before: new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime(),
    });
  }
  return options;
}

export function findPhoto(id: string, root = timelineScroller()): HTMLAnchorElement | undefined {
  return Array.from(root.querySelectorAll<HTMLAnchorElement>(PHOTO_LINK_SELECTOR))
    .find((tile) => new URL(tile.href).pathname === id);
}

export function hasPendingPhotoMetadata(root: HTMLElement): boolean {
  const bounds = root === document.scrollingElement ? { top: 0, bottom: innerHeight } : root.getBoundingClientRect();
  return Array.from(root.querySelectorAll<HTMLAnchorElement>(PHOTO_LINK_SELECTOR)).some((tile) => {
    const rect = tile.getBoundingClientRect();
    return rect.width >= 40 && rect.height >= 40 && rect.bottom > bounds.top && rect.top < bounds.bottom &&
      !normalizeText(tile.getAttribute("aria-label") ?? tile.querySelector("img")?.alt ?? "");
  });
}

export async function showPhoto(photo: PhotoItem, signal: AbortSignal): Promise<HTMLAnchorElement> {
  const root = timelineScroller();
  let tile = findPhoto(photo.id, root);
  if (!tile) {
    root.scrollTop = photo.scrollTop;
    tile = await waitFor(() => findPhoto(photo.id, root), signal, 4000);
  }
  if (!tile) throw new Error("Could not find this photo again. Your place and decisions are preserved; reopen the panel with the extension icon to retry.");
  tile.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
  return tile;
}

export async function loadPhotoPreview(photo: PhotoItem, signal: AbortSignal): Promise<PhotoItem> {
  await showPhoto(photo, signal);
  const current = await waitFor(() =>
    readPhotos().find((item) => item.id === photo.id && item.thumbUrl), signal, 5000);
  if (!current) {
    throw new Error("Waiting for this photo's preview to load in Google Photos. Reopen the panel with the extension icon to retry.");
  }
  return current;
}

function selectionControl(tile: HTMLElement): HTMLElement | undefined {
  const parent = tile.parentElement;
  const controls = parent?.querySelectorAll<HTMLElement>('[role="checkbox"], input[type="checkbox"]') ?? [];
  if (controls.length === 1) return controls[0];
  return Array.from(controls).find((control) => control.getAttribute("aria-label") === tile.getAttribute("aria-label"));
}

export async function setPhotoSelected(photo: PhotoItem, selected: boolean, signal: AbortSignal): Promise<boolean> {
  const tile = await showPhoto(photo, signal);
  const control = selectionControl(tile);
  if (!control) return false;
  const checked = (node: HTMLElement) => node.getAttribute("aria-checked") === "true" ||
    (node instanceof HTMLInputElement && node.checked);
  if (checked(control) === selected) return true;
  signal.throwIfAborted();
  control.click();
  // Once clicked, finish observing the result even if the panel is hidden.
  return Boolean(await waitFor(() => {
    const fresh = findPhoto(photo.id);
    const next = fresh && selectionControl(fresh);
    return next && checked(next) === selected;
  }, signal, 1500));
}

export function hasSelectedPhotos(): boolean {
  return document.querySelector('[role="checkbox"][aria-checked="true"], input[type="checkbox"]:checked') !== null ||
    Array.from(document.querySelectorAll<HTMLElement>('button, [role="button"]')).some((button) =>
      /^(?:clear selection|deselect all|annuler la sélection|désélectionner tout)$/i.test(button.getAttribute("aria-label") ?? "") &&
      button.checkVisibility({ visibilityProperty: true })
    );
}

export async function waitFor<T>(read: () => T | undefined | false, signal: AbortSignal, timeout: number): Promise<T | undefined> {
  const deadline = performance.now() + timeout;
  while (performance.now() <= deadline) {
    signal.throwIfAborted();
    const value = read();
    if (value) return value;
    await delay(80, signal);
  }
  return undefined;
}

export function delay(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
