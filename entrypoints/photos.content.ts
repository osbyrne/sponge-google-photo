type PhotoItem = {
  id: string;
  tile: HTMLElement;
  image?: HTMLImageElement;
  label: string;
  month: string;
  thumbUrl?: string;
};

type SessionState = {
  active: boolean;
  busy: boolean;
  month: string;
  queue: PhotoItem[];
  index: number;
  trashed: PhotoItem[];
  kept: PhotoItem[];
  pendingConfirm: boolean;
  message: string;
};

const ROOT_ID = 'photos-sponge-root';
const VISIBLE_PHOTO_MIN_SIZE = 80;
const PHOTO_LINK_SELECTOR = 'a[href^="./photo/"], a[href^="/photo/"]';
const MONTH_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  year: 'numeric',
});

const state: SessionState = {
  active: false,
  busy: false,
  month: '',
  queue: [],
  index: 0,
  trashed: [],
  kept: [],
  pendingConfirm: false,
  message: '',
};

let root: HTMLDivElement;
let panel: HTMLDivElement;
let photoStage: HTMLDivElement;
let monthSelect: HTMLSelectElement;
let statusLine: HTMLDivElement;

export default defineContentScript({
  matches: ['https://photos.google.com/*'],
  runAt: 'document_idle',
  main() {
    mountUi();
    refreshMonthOptions();

    window.addEventListener('keydown', handleKeydown, true);
    window.addEventListener('scroll', debounce(() => refreshMonthOptions(), 300), true);

    const observer = new MutationObserver(debounce(() => refreshMonthOptions(), 500));
    observer.observe(document.body, { childList: true, subtree: true });
  },
});

function mountUi() {
  document.getElementById(ROOT_ID)?.remove();

  root = document.createElement('div');
  root.id = ROOT_ID;
  root.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    :host, * {
      box-sizing: border-box;
    }

    .panel {
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 2147483647;
      width: min(380px, calc(100vw - 24px));
      overflow: hidden;
      border: 1px solid rgba(22, 32, 38, 0.16);
      border-radius: 8px;
      background: #fbfcfd;
      box-shadow: 0 18px 50px rgba(15, 23, 42, 0.28);
      color: #172026;
      font: 13px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 14px;
      border-bottom: 1px solid #dbe4ea;
      background: #ffffff;
    }

    .title {
      min-width: 0;
      font-size: 14px;
      font-weight: 720;
    }

    .actions,
    .keys {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    button,
    select {
      height: 32px;
      border: 1px solid #c5d0d8;
      border-radius: 6px;
      background: #ffffff;
      color: #172026;
      font: inherit;
    }

    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0 10px;
      cursor: pointer;
      font-weight: 650;
    }

    button.primary {
      border-color: #0f766e;
      background: #0f766e;
      color: white;
    }

    button.danger {
      border-color: #b42318;
      background: #b42318;
      color: white;
    }

    button:disabled {
      cursor: default;
      opacity: 0.5;
    }

    select {
      min-width: 0;
      flex: 1;
      padding: 0 28px 0 8px;
    }

    .body {
      display: grid;
      gap: 12px;
      padding: 12px 14px 14px;
    }

    .picker {
      display: flex;
      gap: 8px;
    }

    .stage {
      display: grid;
      place-items: center;
      min-height: 180px;
      overflow: hidden;
      border: 1px solid #d9e2e8;
      border-radius: 8px;
      background: #eef3f6;
    }

    .stage img {
      display: block;
      max-width: 100%;
      max-height: 320px;
      object-fit: contain;
    }

    .empty {
      max-width: 28ch;
      padding: 24px 18px;
      color: #465a65;
      text-align: center;
    }

    .meta {
      display: grid;
      gap: 4px;
      min-width: 0;
    }

    .photo-label {
      overflow: hidden;
      color: #172026;
      font-weight: 650;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .status {
      color: #526672;
    }

    .keys {
      justify-content: space-between;
    }

    .key {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
    }

    kbd {
      min-width: 22px;
      padding: 2px 6px;
      border: 1px solid #b9c5ce;
      border-bottom-width: 2px;
      border-radius: 4px;
      background: #ffffff;
      color: #172026;
      font: 12px ui-monospace, SFMono-Regular, Menlo, monospace;
      text-align: center;
    }

    .confirm {
      display: grid;
      gap: 10px;
      padding: 12px;
      border: 1px solid #f2b8b5;
      border-radius: 8px;
      background: #fff7f6;
    }

    .confirm strong {
      color: #8c1d18;
    }
  `;

  panel = document.createElement('div');
  panel.className = 'panel';
  panel.innerHTML = `
    <div class="topbar">
      <div class="title">Photos Sponge</div>
      <div class="actions">
        <button type="button" data-action="refresh" title="Refresh visible photos">Refresh</button>
        <button type="button" data-action="hide" title="Hide panel">Hide</button>
      </div>
    </div>
    <div class="body">
      <div class="picker">
        <select aria-label="Month to review"></select>
        <button type="button" class="primary" data-action="start">Start</button>
      </div>
      <div class="stage"><div class="empty">Scroll Google Photos to a month, choose it here, then start.</div></div>
      <div class="meta">
        <div class="photo-label">No review running</div>
        <div class="status">Visible photos are grouped by their Google Photos labels.</div>
      </div>
      <div class="keys">
        <span class="key"><kbd>Y</kbd> keep</span>
        <span class="key"><kbd>N</kbd> trash</span>
        <span class="key"><kbd>U</kbd> undo</span>
        <span class="key"><kbd>Enter</kbd> move marked to trash</span>
        <span class="key"><kbd>Esc</kbd> stop</span>
      </div>
    </div>
  `;

  root.shadowRoot?.append(style, panel);
  document.documentElement.append(root);

  photoStage = mustFind('.stage');
  monthSelect = mustFind('select');
  statusLine = mustFind('.status');

  root.shadowRoot?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const button = target.closest<HTMLButtonElement>('button[data-action]');
    if (!button) return;

    const action = button.dataset.action;
    if (action === 'refresh') refreshMonthOptions(true);
    if (action === 'hide') root.hidden = true;
    if (action === 'start') startMonth();
    if (action === 'confirm-delete') void trashMarkedPhotos();
    if (action === 'cancel-delete') void stopSession('Deletion cancelled. Your marked photos were not changed.');
  });
}

function handleKeydown(event: KeyboardEvent) {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  if (root.hidden && event.key.toLowerCase() === 's') {
    root.hidden = false;
    event.preventDefault();
    return;
  }

  if (!state.active) return;

  const key = event.key.toLowerCase();
  if (key === 'y') {
    event.preventDefault();
    void decideCurrent('keep');
  }
  if (key === 'n') {
    event.preventDefault();
    void decideCurrent('trash');
  }
  if (key === 'u') {
    event.preventDefault();
    void undoDecision();
  }
  if (key === 'enter' && state.pendingConfirm) {
    event.preventDefault();
    void trashMarkedPhotos();
  }
  if (key === 'escape') {
    event.preventDefault();
    void stopSession('Stopped. No photos were moved to trash.');
  }
}

function startMonth() {
  if (hasSelectedPhotos()) {
    updateStatus('Clear the current Google Photos selection before starting a review.');
    return;
  }

  const month = monthSelect.value;
  const items = collectPhotos().filter((item) => item.month === month);

  state.active = true;
  state.busy = false;
  state.month = month;
  state.queue = items;
  state.index = 0;
  state.trashed = [];
  state.kept = [];
  state.pendingConfirm = false;
  state.message = '';

  if (items.length === 0) {
    resetSession('No visible photos found for that month. Scroll the grid and refresh.');
    return;
  }

  renderCurrent();
}

async function decideCurrent(decision: 'keep' | 'trash') {
  if (state.pendingConfirm || state.busy) return;

  const current = state.queue[state.index];
  if (!current) return;

  state.busy = true;
  if (decision === 'trash') {
    updateStatus(`Selecting ${current.label} in Google Photos...`);
    if (!(await setPhotoSelected(current, true))) {
      state.busy = false;
      updateStatus('Google Photos did not select this photo. Scroll it into view and press N again.');
      return;
    }
    state.trashed.push(current);
  } else {
    state.kept.push(current);
  }

  state.index += 1;
  state.busy = false;

  if (state.index >= state.queue.length) {
    state.pendingConfirm = true;
    renderConfirm();
    return;
  }

  renderCurrent();
}

async function undoDecision() {
  if (state.busy) return;
  state.busy = true;

  if (state.pendingConfirm) {
    state.pendingConfirm = false;
    state.index = Math.max(0, state.queue.length - 1);
  } else if (state.index > 0) {
    state.index -= 1;
  }

  const current = state.queue[state.index];
  if (current && state.trashed.some((item) => item.id === current.id)) {
    await setPhotoSelected(current, false);
  }
  state.trashed = state.trashed.filter((item) => item.id !== current?.id);
  state.kept = state.kept.filter((item) => item.id !== current?.id);
  state.busy = false;
  renderCurrent();
}

async function trashMarkedPhotos() {
  if (state.busy) return;
  state.busy = true;
  state.pendingConfirm = false;

  if (state.trashed.length === 0) {
    state.busy = false;
    resetSession('Finished. Nothing was marked for trash.');
    return;
  }

  const visiblyDeselected = state.trashed.filter((item) => {
    const control = findSelectControl(findFreshTile(item) ?? item.tile);
    return control !== null && !isPhotoSelected(control);
  });
  if (visiblyDeselected.length > 0) {
    state.busy = false;
    state.pendingConfirm = true;
    renderConfirm();
    updateStatus(
      `${visiblyDeselected.length} marked photo${plural(visiblyDeselected.length)} lost its Google Photos selection. ` +
      'Press U and mark it again.',
    );
    return;
  }

  updateStatus(`Moving ${state.trashed.length} selected photo${plural(state.trashed.length)} to trash...`);

  const trashButton = await waitForElement(findTrashButton, 2_000);
  if (!trashButton) {
    state.busy = false;
    state.pendingConfirm = true;
    renderConfirm();
    updateStatus('Google Photos did not show its trash button. The marked photos remain selected.');
    return;
  }

  trashButton.click();

  const confirmButton = await waitForElement(findDialogConfirmButton, 2_500);
  if (confirmButton) {
    confirmButton.click();
    await wait(400);
    state.busy = false;
    resetSession(`Sent ${state.trashed.length} photo${plural(state.trashed.length)} to Google Photos trash.`);
  } else {
    state.busy = false;
    state.pendingConfirm = true;
    renderConfirm();
    updateStatus('Google Photos did not open a confirmation dialog. The marked photos remain selected.');
  }
}

function collectPhotos(): PhotoItem[] {
  const candidates = new Set<HTMLElement>();
  const selectors = [
    '[role="gridcell"]',
    PHOTO_LINK_SELECTOR,
    'div[aria-label][tabindex]',
    'div[jsaction][aria-label]',
  ];

  for (const selector of selectors) {
    document.querySelectorAll<HTMLElement>(selector).forEach((element) => {
      const tile = element.matches(PHOTO_LINK_SELECTOR)
        ? element
        : element.querySelector<HTMLElement>(PHOTO_LINK_SELECTOR) ?? element;
      if (findVisualAsset(tile)) candidates.add(tile);
    });
  }

  const photos = Array.from(candidates)
    .filter(isVisiblePhotoTile)
    .map(toPhotoItem)
    .filter((item): item is PhotoItem => item !== null);

  const seen = new Set<string>();
  return photos.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function toPhotoItem(tile: HTMLElement): PhotoItem | null {
  const { image, thumbUrl } = findVisualAsset(tile) ?? {};
  const label = normalizeText(
    tile.getAttribute('aria-label') ??
    image?.getAttribute('aria-label') ??
    image?.alt ??
    nearestTextLabel(tile) ??
    'Visible photo',
  );
  const month = monthFromLabel(label) ?? monthFromNearbyHeading(tile) ?? 'Visible photos';
  const id = [
    tile.getAttribute('data-id'),
    tile.getAttribute('href'),
    label,
    thumbUrl,
    Math.round(tile.getBoundingClientRect().top + window.scrollY),
  ]
    .filter(Boolean)
    .join('|');

  return { id, tile, image, label, month, thumbUrl };
}

function findVisualAsset(tile: HTMLElement): Pick<PhotoItem, 'image' | 'thumbUrl'> | null {
  const image = tile.querySelector<HTMLImageElement>('img');
  if (image) return { image, thumbUrl: image.currentSrc || image.src || undefined };

  const elements = [tile, ...tile.querySelectorAll<HTMLElement>('*')];
  for (const element of elements) {
    const thumbUrl = element.getAttribute('data-latest-bg') ?? backgroundImageUrl(element);
    if (thumbUrl) return { thumbUrl };
  }

  return null;
}

function backgroundImageUrl(element: HTMLElement): string | undefined {
  const backgroundImage = getComputedStyle(element).backgroundImage;
  const match = backgroundImage.match(/^url\(["']?(.*?)["']?\)$/);
  return match?.[1] || undefined;
}

function refreshMonthOptions(showMessage = false) {
  if (!monthSelect) return;

  const previous = monthSelect.value;
  const monthCounts = new Map<string, number>();
  for (const photo of collectPhotos()) {
    monthCounts.set(photo.month, (monthCounts.get(photo.month) ?? 0) + 1);
  }

  monthSelect.replaceChildren(
    ...Array.from(monthCounts.entries()).map(([month, count]) => {
      const option = document.createElement('option');
      option.value = month;
      option.textContent = `${month} (${count})`;
      return option;
    }),
  );

  if (previous && monthCounts.has(previous)) monthSelect.value = previous;

  if (monthCounts.size === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No visible months found';
    monthSelect.append(option);
  }

  if (showMessage) updateStatus(`Refreshed. Found ${sum(monthCounts)} visible photo${plural(sum(monthCounts))}.`);
}

function renderCurrent() {
  const current = state.queue[state.index];
  if (!current) {
    renderConfirm();
    return;
  }

  photoStage.replaceChildren();
  if (current.thumbUrl) {
    const preview = document.createElement('img');
    preview.src = current.thumbUrl;
    preview.alt = current.label;
    photoStage.append(preview);
  } else {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'Preview unavailable. Use the highlighted tile in Google Photos.';
    photoStage.append(empty);
  }

  const label = mustFind('.photo-label');
  label.textContent = current.label;
  current.tile.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
  flashTile(current.tile);
  updateStatus(
    `${state.month}: ${state.index + 1}/${state.queue.length}. ` +
    `${state.trashed.length} marked for trash, ${state.kept.length} kept.`,
  );
}

function renderConfirm() {
  photoStage.innerHTML = `
    <div class="confirm">
      <strong>Confirm before deleting</strong>
      <span>${state.trashed.length} photo${plural(state.trashed.length)} marked for trash from ${escapeHtml(state.month)}.</span>
      <div class="actions">
        <button type="button" class="danger" data-action="confirm-delete">Move to trash</button>
        <button type="button" data-action="cancel-delete">Cancel</button>
      </div>
    </div>
  `;

  const label = mustFind('.photo-label');
  label.textContent = 'Month complete';
  updateStatus(`${state.kept.length} kept. Press U to review the last photo again.`);
}

function resetSession(message: string) {
  state.active = false;
  state.busy = false;
  state.month = '';
  state.queue = [];
  state.index = 0;
  state.trashed = [];
  state.kept = [];
  state.pendingConfirm = false;
  state.message = message;

  const label = mustFind('.photo-label');
  label.textContent = 'No review running';
  photoStage.innerHTML = `<div class="empty">${escapeHtml(message)}</div>`;
  updateStatus(message);
  refreshMonthOptions();
}

async function stopSession(message: string) {
  if (state.busy) return;
  state.busy = true;
  await clearPhotoSelection(state.trashed);
  state.busy = false;
  resetSession(message);
}

async function clearPhotoSelection(items: PhotoItem[]) {
  for (const item of items) {
    await setPhotoSelected(item, false);
    await wait(90);
  }
}

async function setPhotoSelected(item: PhotoItem, selected: boolean): Promise<boolean> {
  const freshTile = findFreshTile(item) ?? item.tile;
  freshTile.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' });
  await wait(120);

  const selectControl = findSelectControl(freshTile);
  if (!selectControl) return false;
  if (isPhotoSelected(selectControl) === selected) return true;

  selectControl.click();
  await wait(120);
  return isPhotoSelected(findSelectControl(freshTile)) === selected;
}

function findFreshTile(item: PhotoItem): HTMLElement | null {
  return collectPhotos().find((candidate) => candidate.id === item.id || candidate.label === item.label)?.tile ?? null;
}

function findSelectControl(tile: HTMLElement): HTMLElement | null {
  const label = tile.getAttribute('aria-label');
  const photoContainer = tile.parentElement;
  const localCheckboxes = Array.from(photoContainer?.querySelectorAll<HTMLElement>('[role="checkbox"]') ?? []);
  const exactLocalMatch = localCheckboxes.find((control) => control.getAttribute('aria-label') === label);
  if (exactLocalMatch) return exactLocalMatch;

  const globalCheckboxes = Array.from(document.querySelectorAll<HTMLElement>('[role="checkbox"]'));
  const exactGlobalMatch = globalCheckboxes.find((control) => control.getAttribute('aria-label') === label);
  if (exactGlobalMatch) return exactGlobalMatch;

  const controls = Array.from(tile.querySelectorAll<HTMLElement>('button, [role="button"], [aria-label]'));
  return (
    controls.find((control) => /select|check|tick/i.test(control.getAttribute('aria-label') ?? '')) ??
    controls.find((control) => {
      const rect = control.getBoundingClientRect();
      const tileRect = tile.getBoundingClientRect();
      return rect.width > 12 && rect.height > 12 && rect.left < tileRect.left + tileRect.width * 0.45;
    }) ??
    null
  );
}

function isPhotoSelected(control: HTMLElement | null): boolean {
  if (!control) return false;
  if (control.getAttribute('aria-checked') === 'true') return true;
  return control instanceof HTMLInputElement && control.checked;
}

function hasSelectedPhotos(): boolean {
  return document.querySelector('[role="checkbox"][aria-checked="true"], input[type="checkbox"]:checked') !== null;
}

function findTrashButton(): HTMLElement | null {
  const controls = Array.from(document.querySelectorAll<HTMLElement>('button, [role="button"]'));
  return controls.find((element) => isVisibleControl(element) && /move to trash|trash|delete|bin|remove/i.test(accessibleName(element))) ?? null;
}

function findDialogConfirmButton(): HTMLElement | null {
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], [aria-modal="true"]'));
  const scope = dialogs.filter(isVisibleControl).at(-1);
  if (!scope) return null;
  const buttons = Array.from(scope.querySelectorAll<HTMLElement>('button, [role="button"]'));
  return buttons.find((button) => isVisibleControl(button) && /move to trash|trash|delete|remove/i.test(accessibleName(button))) ?? null;
}

function isVisibleControl(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
}

function isVisiblePhotoTile(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width < VISIBLE_PHOTO_MIN_SIZE || rect.height < VISIBLE_PHOTO_MIN_SIZE) return false;
  if (rect.bottom < 0 || rect.top > window.innerHeight) return false;
  if (rect.right < 0 || rect.left > window.innerWidth) return false;
  return getComputedStyle(element).visibility !== 'hidden';
}

function monthFromLabel(label: string): string | null {
  const date = Date.parse(label);
  if (!Number.isNaN(date)) return MONTH_FORMAT.format(new Date(date));

  const match = label.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/i,
  );
  if (!match) return null;

  const matchedDate = Date.parse(match[0]);
  return Number.isNaN(matchedDate) ? null : MONTH_FORMAT.format(new Date(matchedDate));
}

function monthFromNearbyHeading(tile: HTMLElement): string | null {
  let cursor: Element | null = tile;
  for (let depth = 0; cursor && depth < 6; depth += 1) {
    const heading = cursor.querySelector<HTMLElement>('[role="heading"], h1, h2, h3, [aria-label]');
    const text = normalizeText(heading?.textContent ?? heading?.getAttribute('aria-label') ?? '');
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

function flashTile(tile: HTMLElement) {
  const previousOutline = tile.style.outline;
  const previousOffset = tile.style.outlineOffset;
  tile.style.outline = '4px solid #0f766e';
  tile.style.outlineOffset = '2px';
  window.setTimeout(() => {
    tile.style.outline = previousOutline;
    tile.style.outlineOffset = previousOffset;
  }, 600);
}

function accessibleName(element: HTMLElement): string {
  return normalizeText(
    [
      element.getAttribute('aria-label'),
      element.getAttribute('title'),
      element.textContent,
      element.querySelector('svg title')?.textContent,
    ]
      .filter(Boolean)
      .join(' '),
  );
}

function updateStatus(message: string) {
  statusLine.textContent = message;
}

function normalizeText(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

function debounce<T extends (...args: never[]) => void>(fn: T, delay: number) {
  let timeout: number | undefined;
  return (...args: Parameters<T>) => {
    window.clearTimeout(timeout);
    timeout = window.setTimeout(() => fn(...args), delay);
  };
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitForElement(find: () => HTMLElement | null, timeoutMs: number): Promise<HTMLElement | null> {
  const deadline = Date.now() + timeoutMs;
  let element = find();
  while (!element && Date.now() < deadline) {
    await wait(50);
    element = find();
  }
  return element;
}

function plural(count: number) {
  return count === 1 ? '' : 's';
}

function sum(map: Map<string, number>) {
  return Array.from(map.values()).reduce((total, value) => total + value, 0);
}

function escapeHtml(value: string) {
  const element = document.createElement('div');
  element.textContent = value;
  return element.innerHTML;
}

function mustFind<T extends Element>(selector: string): T {
  const element = root.shadowRoot?.querySelector<T>(selector);
  if (!element) throw new Error(`Missing Photos Sponge UI element: ${selector}`);
  return element;
}
