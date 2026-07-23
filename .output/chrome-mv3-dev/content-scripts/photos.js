var photos = (function() {
	//#region node_modules/wxt/dist/utils/define-content-script.mjs
	function defineContentScript(definition) {
		return definition;
	}
	//#endregion
	//#region entrypoints/photos.content.ts
	var ROOT_ID = "photos-sponge-root";
	var VISIBLE_PHOTO_MIN_SIZE = 80;
	var MONTH_FORMAT = new Intl.DateTimeFormat(void 0, {
		month: "long",
		year: "numeric"
	});
	var state = {
		active: false,
		month: "",
		queue: [],
		index: 0,
		trashed: [],
		kept: [],
		pendingConfirm: false,
		message: ""
	};
	var root;
	var panel;
	var photoStage;
	var monthSelect;
	var statusLine;
	var photos_content_default = defineContentScript({
		matches: ["https://photos.google.com/*"],
		runAt: "document_idle",
		main() {
			mountUi();
			refreshMonthOptions();
			window.addEventListener("keydown", handleKeydown, true);
			window.addEventListener("scroll", debounce(() => refreshMonthOptions(), 300), true);
			new MutationObserver(debounce(() => refreshMonthOptions(), 500)).observe(document.body, {
				childList: true,
				subtree: true
			});
		}
	});
	function mountUi() {
		document.getElementById(ROOT_ID)?.remove();
		root = document.createElement("div");
		root.id = ROOT_ID;
		root.attachShadow({ mode: "open" });
		const style = document.createElement("style");
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
		panel = document.createElement("div");
		panel.className = "panel";
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
        <span class="key"><kbd>Esc</kbd> stop</span>
      </div>
    </div>
  `;
		root.shadowRoot?.append(style, panel);
		document.documentElement.append(root);
		photoStage = mustFind(".stage");
		monthSelect = mustFind("select");
		statusLine = mustFind(".status");
		root.shadowRoot?.addEventListener("click", (event) => {
			const button = event.target.closest("button[data-action]");
			if (!button) return;
			const action = button.dataset.action;
			if (action === "refresh") refreshMonthOptions(true);
			if (action === "hide") root.hidden = true;
			if (action === "start") startMonth();
			if (action === "confirm-delete") trashMarkedPhotos();
			if (action === "cancel-delete") resetSession("Deletion cancelled. Your marked photos were not changed.");
		});
	}
	function handleKeydown(event) {
		if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
		if (root.hidden && event.key.toLowerCase() === "s") {
			root.hidden = false;
			event.preventDefault();
			return;
		}
		if (!state.active) return;
		const key = event.key.toLowerCase();
		if (key === "y") {
			event.preventDefault();
			decideCurrent("keep");
		}
		if (key === "n") {
			event.preventDefault();
			decideCurrent("trash");
		}
		if (key === "u") {
			event.preventDefault();
			undoDecision();
		}
		if (key === "escape") {
			event.preventDefault();
			resetSession("Stopped. No Google Photos changes were made.");
		}
	}
	function startMonth() {
		const month = monthSelect.value;
		const items = collectPhotos().filter((item) => item.month === month);
		state.active = true;
		state.month = month;
		state.queue = items;
		state.index = 0;
		state.trashed = [];
		state.kept = [];
		state.pendingConfirm = false;
		state.message = "";
		if (items.length === 0) {
			resetSession("No visible photos found for that month. Scroll the grid and refresh.");
			return;
		}
		renderCurrent();
	}
	function decideCurrent(decision) {
		if (state.pendingConfirm) return;
		const current = state.queue[state.index];
		if (!current) return;
		if (decision === "trash") state.trashed.push(current);
		else state.kept.push(current);
		state.index += 1;
		if (state.index >= state.queue.length) {
			state.pendingConfirm = true;
			renderConfirm();
			return;
		}
		renderCurrent();
	}
	function undoDecision() {
		if (state.pendingConfirm) {
			state.pendingConfirm = false;
			state.index = Math.max(0, state.queue.length - 1);
		} else if (state.index > 0) state.index -= 1;
		const current = state.queue[state.index];
		state.trashed = state.trashed.filter((item) => item.id !== current?.id);
		state.kept = state.kept.filter((item) => item.id !== current?.id);
		renderCurrent();
	}
	async function trashMarkedPhotos() {
		state.pendingConfirm = false;
		if (state.trashed.length === 0) {
			resetSession("Finished. Nothing was marked for trash.");
			return;
		}
		updateStatus(`Selecting ${state.trashed.length} marked photo${plural(state.trashed.length)}...`);
		const selected = [];
		for (const item of state.trashed) {
			if (await selectPhoto(item)) selected.push(item);
			await wait(90);
		}
		if (selected.length === 0) {
			resetSession("I could not find Google Photos selection controls for the marked photos. Nothing was deleted.");
			return;
		}
		updateStatus(`Selected ${selected.length}. Opening Google Photos trash action...`);
		await wait(250);
		const trashButton = findTrashButton();
		if (!trashButton) {
			resetSession("Selected the marked photos, but could not find the Google Photos trash button. Use the toolbar trash icon to finish.");
			return;
		}
		trashButton.click();
		await wait(300);
		const confirmButton = findDialogConfirmButton();
		if (confirmButton) {
			confirmButton.click();
			resetSession(`Sent ${selected.length} photo${plural(selected.length)} to Google Photos trash.`);
		} else resetSession(`Opened the Google Photos trash action for ${selected.length} selected photo${plural(selected.length)}. Confirm the Google Photos dialog to finish.`);
	}
	function collectPhotos() {
		const candidates = /* @__PURE__ */ new Set();
		for (const selector of [
			"[role=\"gridcell\"]",
			"a[href*=\"/photo/\"]",
			"div[aria-label][tabindex]",
			"div[jsaction][aria-label]"
		]) document.querySelectorAll(selector).forEach((element) => {
			if (element.querySelector("img")) candidates.add(element);
		});
		const photos = Array.from(candidates).filter(isVisiblePhotoTile).map(toPhotoItem).filter((item) => item !== null);
		const seen = /* @__PURE__ */ new Set();
		return photos.filter((item) => {
			if (seen.has(item.id)) return false;
			seen.add(item.id);
			return true;
		});
	}
	function toPhotoItem(tile) {
		const image = tile.querySelector("img") ?? void 0;
		const label = normalizeText(tile.getAttribute("aria-label") ?? image?.getAttribute("aria-label") ?? image?.alt ?? nearestTextLabel(tile) ?? "Visible photo");
		const month = monthFromLabel(label) ?? monthFromNearbyHeading(tile) ?? "Visible photos";
		const thumbUrl = image?.currentSrc || image?.src || void 0;
		return {
			id: [
				tile.getAttribute("data-id"),
				tile.getAttribute("href"),
				label,
				thumbUrl,
				Math.round(tile.getBoundingClientRect().top + window.scrollY)
			].filter(Boolean).join("|"),
			tile,
			image,
			label,
			month,
			thumbUrl
		};
	}
	function refreshMonthOptions(showMessage = false) {
		if (!monthSelect) return;
		const previous = monthSelect.value;
		const monthCounts = /* @__PURE__ */ new Map();
		for (const photo of collectPhotos()) monthCounts.set(photo.month, (monthCounts.get(photo.month) ?? 0) + 1);
		monthSelect.replaceChildren(...Array.from(monthCounts.entries()).map(([month, count]) => {
			const option = document.createElement("option");
			option.value = month;
			option.textContent = `${month} (${count})`;
			return option;
		}));
		if (previous && monthCounts.has(previous)) monthSelect.value = previous;
		if (monthCounts.size === 0) {
			const option = document.createElement("option");
			option.value = "";
			option.textContent = "No visible months found";
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
			const preview = document.createElement("img");
			preview.src = current.thumbUrl;
			preview.alt = current.label;
			photoStage.append(preview);
		} else {
			const empty = document.createElement("div");
			empty.className = "empty";
			empty.textContent = "Preview unavailable. Use the highlighted tile in Google Photos.";
			photoStage.append(empty);
		}
		const label = mustFind(".photo-label");
		label.textContent = current.label;
		current.tile.scrollIntoView({
			block: "center",
			inline: "center",
			behavior: "smooth"
		});
		flashTile(current.tile);
		updateStatus(`${state.month}: ${state.index + 1}/${state.queue.length}. ${state.trashed.length} marked for trash, ${state.kept.length} kept.`);
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
		const label = mustFind(".photo-label");
		label.textContent = "Month complete";
		updateStatus(`${state.kept.length} kept. Press U to review the last photo again.`);
	}
	function resetSession(message) {
		state.active = false;
		state.month = "";
		state.queue = [];
		state.index = 0;
		state.trashed = [];
		state.kept = [];
		state.pendingConfirm = false;
		state.message = message;
		const label = mustFind(".photo-label");
		label.textContent = "No review running";
		photoStage.innerHTML = `<div class="empty">${escapeHtml(message)}</div>`;
		updateStatus(message);
		refreshMonthOptions();
	}
	async function selectPhoto(item) {
		const freshTile = findFreshTile(item) ?? item.tile;
		freshTile.scrollIntoView({
			block: "center",
			inline: "center",
			behavior: "smooth"
		});
		await wait(180);
		const selectControl = findSelectControl(freshTile);
		if (selectControl) {
			selectControl.click();
			return true;
		}
		const checkbox = freshTile.querySelector("[role=\"checkbox\"]");
		if (checkbox) {
			checkbox.click();
			return true;
		}
		return false;
	}
	function findFreshTile(item) {
		return collectPhotos().find((candidate) => candidate.id === item.id || candidate.label === item.label)?.tile ?? null;
	}
	function findSelectControl(tile) {
		const controls = Array.from(tile.querySelectorAll("button, [role=\"button\"], [aria-label]"));
		return controls.find((control) => /select|check|tick/i.test(control.getAttribute("aria-label") ?? "")) ?? controls.find((control) => {
			const rect = control.getBoundingClientRect();
			const tileRect = tile.getBoundingClientRect();
			return rect.width > 12 && rect.height > 12 && rect.left < tileRect.left + tileRect.width * .45;
		}) ?? null;
	}
	function findTrashButton() {
		return Array.from(document.querySelectorAll("button, [role=\"button\"]")).find((element) => /trash|delete|bin|remove/i.test(accessibleName(element))) ?? null;
	}
	function findDialogConfirmButton() {
		const scope = Array.from(document.querySelectorAll("[role=\"dialog\"], [aria-modal=\"true\"]")).at(-1) ?? document.body;
		return Array.from(scope.querySelectorAll("button, [role=\"button\"]")).find((button) => /move to trash|trash|delete|remove/i.test(accessibleName(button))) ?? null;
	}
	function isVisiblePhotoTile(element) {
		const rect = element.getBoundingClientRect();
		if (rect.width < VISIBLE_PHOTO_MIN_SIZE || rect.height < VISIBLE_PHOTO_MIN_SIZE) return false;
		if (rect.bottom < 0 || rect.top > window.innerHeight) return false;
		if (rect.right < 0 || rect.left > window.innerWidth) return false;
		return getComputedStyle(element).visibility !== "hidden";
	}
	function monthFromLabel(label) {
		const date = Date.parse(label);
		if (!Number.isNaN(date)) return MONTH_FORMAT.format(new Date(date));
		const match = label.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/i);
		if (!match) return null;
		const matchedDate = Date.parse(match[0]);
		return Number.isNaN(matchedDate) ? null : MONTH_FORMAT.format(new Date(matchedDate));
	}
	function monthFromNearbyHeading(tile) {
		let cursor = tile;
		for (let depth = 0; cursor && depth < 6; depth += 1) {
			const heading = cursor.querySelector("[role=\"heading\"], h1, h2, h3, [aria-label]");
			const month = monthFromLabel(normalizeText(heading?.textContent ?? heading?.getAttribute("aria-label") ?? ""));
			if (month) return month;
			cursor = cursor.parentElement;
		}
		return null;
	}
	function nearestTextLabel(tile) {
		const texts = [];
		let cursor = tile;
		for (let depth = 0; cursor && depth < 4; depth += 1) {
			const text = normalizeText(cursor.innerText);
			if (text && text.length < 120) texts.push(text);
			cursor = cursor.parentElement;
		}
		return texts[0] ?? null;
	}
	function flashTile(tile) {
		const previousOutline = tile.style.outline;
		const previousOffset = tile.style.outlineOffset;
		tile.style.outline = "4px solid #0f766e";
		tile.style.outlineOffset = "2px";
		window.setTimeout(() => {
			tile.style.outline = previousOutline;
			tile.style.outlineOffset = previousOffset;
		}, 600);
	}
	function accessibleName(element) {
		return normalizeText([
			element.getAttribute("aria-label"),
			element.getAttribute("title"),
			element.textContent,
			element.querySelector("svg title")?.textContent
		].filter(Boolean).join(" "));
	}
	function updateStatus(message) {
		statusLine.textContent = message;
	}
	function normalizeText(text) {
		return (text ?? "").replace(/\s+/g, " ").trim();
	}
	function debounce(fn, delay) {
		let timeout;
		return (...args) => {
			window.clearTimeout(timeout);
			timeout = window.setTimeout(() => fn(...args), delay);
		};
	}
	function wait(ms) {
		return new Promise((resolve) => window.setTimeout(resolve, ms));
	}
	function plural(count) {
		return count === 1 ? "" : "s";
	}
	function sum(map) {
		return Array.from(map.values()).reduce((total, value) => total + value, 0);
	}
	function escapeHtml(value) {
		const element = document.createElement("div");
		element.textContent = value;
		return element.innerHTML;
	}
	function mustFind(selector) {
		const element = root.shadowRoot?.querySelector(selector);
		if (!element) throw new Error(`Missing Photos Sponge UI element: ${selector}`);
		return element;
	}
	//#endregion
	//#region node_modules/wxt/dist/utils/internal/logger.mjs
	function print$1(method, ...args) {
		if (typeof args[0] === "string") method(`[wxt] ${args.shift()}`, ...args);
		else method("[wxt]", ...args);
	}
	/** Wrapper around `console` with a "[wxt]" prefix */
	var logger$1 = {
		debug: (...args) => print$1(console.debug, ...args),
		log: (...args) => print$1(console.log, ...args),
		warn: (...args) => print$1(console.warn, ...args),
		error: (...args) => print$1(console.error, ...args)
	};
	//#endregion
	//#region node_modules/wxt/dist/browser.mjs
	/**
	* Contains the `browser` export which you should use to access the extension
	* APIs in your project:
	*
	* ```ts
	* import { browser } from 'wxt/browser';
	*
	* browser.runtime.onInstalled.addListener(() => {
	*   // ...
	* });
	* ```
	*
	* @module wxt/browser
	*/
	var browser = globalThis.browser?.runtime?.id ? globalThis.browser : globalThis.chrome;
	//#endregion
	//#region node_modules/wxt/dist/utils/internal/custom-events.mjs
	var WxtLocationChangeEvent = class WxtLocationChangeEvent extends Event {
		static EVENT_NAME = getUniqueEventName("wxt:locationchange");
		constructor(newUrl, oldUrl) {
			super(WxtLocationChangeEvent.EVENT_NAME, {});
			this.newUrl = newUrl;
			this.oldUrl = oldUrl;
		}
	};
	/**
	* Returns an event name unique to the extension and content script that's
	* running.
	*/
	function getUniqueEventName(eventName) {
		return `${browser?.runtime?.id}:photos:${eventName}`;
	}
	//#endregion
	//#region node_modules/wxt/dist/utils/internal/location-watcher.mjs
	var supportsNavigationApi = typeof globalThis.navigation?.addEventListener === "function";
	/**
	* Create a util that watches for URL changes, dispatching the custom event when
	* detected. Stops watching when content script is invalidated. Uses Navigation
	* API when available, otherwise falls back to polling.
	*/
	function createLocationWatcher(ctx) {
		let lastUrl;
		let watching = false;
		return { run() {
			if (watching) return;
			watching = true;
			lastUrl = new URL(location.href);
			if (supportsNavigationApi) globalThis.navigation.addEventListener("navigate", (event) => {
				const newUrl = new URL(event.destination.url);
				if (newUrl.href === lastUrl.href) return;
				window.dispatchEvent(new WxtLocationChangeEvent(newUrl, lastUrl));
				lastUrl = newUrl;
			}, { signal: ctx.signal });
			else ctx.setInterval(() => {
				const newUrl = new URL(location.href);
				if (newUrl.href !== lastUrl.href) {
					window.dispatchEvent(new WxtLocationChangeEvent(newUrl, lastUrl));
					lastUrl = newUrl;
				}
			}, 1e3);
		} };
	}
	//#endregion
	//#region node_modules/wxt/dist/utils/content-script-context.mjs
	/**
	* Implements
	* [`AbortController`](https://developer.mozilla.org/en-US/docs/Web/API/AbortController).
	* Used to detect and stop content script code when the script is invalidated.
	*
	* It also provides several utilities like `ctx.setTimeout` and
	* `ctx.setInterval` that should be used in content scripts instead of
	* `window.setTimeout` or `window.setInterval`.
	*
	* To create context for testing, you can use the class's constructor:
	*
	* ```ts
	* import { ContentScriptContext } from 'wxt/utils/content-scripts-context';
	*
	* test('storage listener should be removed when context is invalidated', () => {
	*   const ctx = new ContentScriptContext('test');
	*   const item = storage.defineItem('local:count', { defaultValue: 0 });
	*   const watcher = vi.fn();
	*
	*   const unwatch = item.watch(watcher);
	*   ctx.onInvalidated(unwatch); // Listen for invalidate here
	*
	*   await item.setValue(1);
	*   expect(watcher).toBeCalledTimes(1);
	*   expect(watcher).toBeCalledWith(1, 0);
	*
	*   ctx.notifyInvalidated(); // Use this function to invalidate the context
	*   await item.setValue(2);
	*   expect(watcher).toBeCalledTimes(1);
	* });
	* ```
	*/
	var ContentScriptContext = class ContentScriptContext {
		static SCRIPT_STARTED_MESSAGE_TYPE = getUniqueEventName("wxt:content-script-started");
		id;
		abortController;
		locationWatcher = createLocationWatcher(this);
		constructor(contentScriptName, options) {
			this.contentScriptName = contentScriptName;
			this.options = options;
			this.id = Math.random().toString(36).slice(2);
			this.abortController = new AbortController();
			this.stopOldScripts();
			this.listenForNewerScripts();
		}
		get signal() {
			return this.abortController.signal;
		}
		abort(reason) {
			return this.abortController.abort(reason);
		}
		get isInvalid() {
			if (browser.runtime?.id == null) this.notifyInvalidated();
			return this.signal.aborted;
		}
		get isValid() {
			return !this.isInvalid;
		}
		/**
		* Add a listener that is called when the content script's context is
		* invalidated.
		*
		* @example
		*   browser.runtime.onMessage.addListener(cb);
		*   const removeInvalidatedListener = ctx.onInvalidated(() => {
		*     browser.runtime.onMessage.removeListener(cb);
		*   });
		*   // ...
		*   removeInvalidatedListener();
		*
		* @returns A function to remove the listener.
		*/
		onInvalidated(cb) {
			this.signal.addEventListener("abort", cb);
			return () => this.signal.removeEventListener("abort", cb);
		}
		/**
		* Return a promise that never resolves. Useful if you have an async function
		* that shouldn't run after the context is expired.
		*
		* @example
		*   const getValueFromStorage = async () => {
		*     if (ctx.isInvalid) return ctx.block();
		*
		*     // ...
		*   };
		*/
		block() {
			return new Promise(() => {});
		}
		/**
		* Wrapper around `window.setInterval` that automatically clears the interval
		* when invalidated.
		*
		* Intervals can be cleared by calling the normal `clearInterval` function.
		*/
		setInterval(handler, timeout) {
			const id = setInterval(() => {
				if (this.isValid) handler();
			}, timeout);
			this.onInvalidated(() => clearInterval(id));
			return id;
		}
		/**
		* Wrapper around `window.setTimeout` that automatically clears the interval
		* when invalidated.
		*
		* Timeouts can be cleared by calling the normal `setTimeout` function.
		*/
		setTimeout(handler, timeout) {
			const id = setTimeout(() => {
				if (this.isValid) handler();
			}, timeout);
			this.onInvalidated(() => clearTimeout(id));
			return id;
		}
		/**
		* Wrapper around `window.requestAnimationFrame` that automatically cancels
		* the request when invalidated.
		*
		* Callbacks can be canceled by calling the normal `cancelAnimationFrame`
		* function.
		*/
		requestAnimationFrame(callback) {
			const id = requestAnimationFrame((...args) => {
				if (this.isValid) callback(...args);
			});
			this.onInvalidated(() => cancelAnimationFrame(id));
			return id;
		}
		/**
		* Wrapper around `window.requestIdleCallback` that automatically cancels the
		* request when invalidated.
		*
		* Callbacks can be canceled by calling the normal `cancelIdleCallback`
		* function.
		*/
		requestIdleCallback(callback, options) {
			const id = requestIdleCallback((...args) => {
				if (!this.signal.aborted) callback(...args);
			}, options);
			this.onInvalidated(() => cancelIdleCallback(id));
			return id;
		}
		addEventListener(target, type, handler, options) {
			if (type === "wxt:locationchange") {
				if (this.isValid) this.locationWatcher.run();
			}
			target.addEventListener?.(type.startsWith("wxt:") ? getUniqueEventName(type) : type, handler, {
				...options,
				signal: this.signal
			});
		}
		/**
		* @internal
		* Abort the abort controller and execute all `onInvalidated` listeners.
		*/
		notifyInvalidated() {
			this.abort("Content script context invalidated");
			logger$1.debug(`Content script "${this.contentScriptName}" context invalidated`);
		}
		stopOldScripts() {
			document.dispatchEvent(new CustomEvent(ContentScriptContext.SCRIPT_STARTED_MESSAGE_TYPE, { detail: {
				contentScriptName: this.contentScriptName,
				messageId: this.id
			} }));
			if (!this.options?.noScriptStartedPostMessage) window.postMessage({
				type: ContentScriptContext.SCRIPT_STARTED_MESSAGE_TYPE,
				contentScriptName: this.contentScriptName,
				messageId: this.id
			}, "*");
		}
		verifyScriptStartedEvent(event) {
			const isSameContentScript = event.detail?.contentScriptName === this.contentScriptName;
			const isFromSelf = event.detail?.messageId === this.id;
			return isSameContentScript && !isFromSelf;
		}
		listenForNewerScripts() {
			const cb = (event) => {
				if (!(event instanceof CustomEvent) || !this.verifyScriptStartedEvent(event)) return;
				this.notifyInvalidated();
			};
			document.addEventListener(ContentScriptContext.SCRIPT_STARTED_MESSAGE_TYPE, cb);
			this.onInvalidated(() => document.removeEventListener(ContentScriptContext.SCRIPT_STARTED_MESSAGE_TYPE, cb));
		}
	};
	//#endregion
	//#region \0virtual:wxt-content-script-isolated-world-entrypoint?/Users/osbyrne/sponge-web/entrypoints/photos.content.ts
	function print(method, ...args) {
		if (typeof args[0] === "string") method(`[wxt] ${args.shift()}`, ...args);
		else method("[wxt]", ...args);
	}
	/** Wrapper around `console` with a "[wxt]" prefix */
	var logger = {
		debug: (...args) => print(console.debug, ...args),
		log: (...args) => print(console.log, ...args),
		warn: (...args) => print(console.warn, ...args),
		error: (...args) => print(console.error, ...args)
	};
	//#endregion
	return (async () => {
		try {
			const { main, ...options } = photos_content_default;
			return await main(new ContentScriptContext("photos", options));
		} catch (err) {
			logger.error(`The content script "photos" crashed on startup!`, err);
			throw err;
		}
	})();
})();

photos;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGhvdG9zLmpzIiwibmFtZXMiOlsicHJpbnQiLCJsb2dnZXIiLCJicm93c2VyIl0sInNvdXJjZXMiOlsiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL3d4dC9kaXN0L3V0aWxzL2RlZmluZS1jb250ZW50LXNjcmlwdC5tanMiLCIuLi8uLi8uLi9lbnRyeXBvaW50cy9waG90b3MuY29udGVudC50cyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy93eHQvZGlzdC91dGlscy9pbnRlcm5hbC9sb2dnZXIubWpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL0B3eHQtZGV2L2Jyb3dzZXIvc3JjL2luZGV4Lm1qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy93eHQvZGlzdC9icm93c2VyLm1qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy93eHQvZGlzdC91dGlscy9pbnRlcm5hbC9jdXN0b20tZXZlbnRzLm1qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy93eHQvZGlzdC91dGlscy9pbnRlcm5hbC9sb2NhdGlvbi13YXRjaGVyLm1qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy93eHQvZGlzdC91dGlscy9jb250ZW50LXNjcmlwdC1jb250ZXh0Lm1qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyNyZWdpb24gc3JjL3V0aWxzL2RlZmluZS1jb250ZW50LXNjcmlwdC50c1xuZnVuY3Rpb24gZGVmaW5lQ29udGVudFNjcmlwdChkZWZpbml0aW9uKSB7XG5cdHJldHVybiBkZWZpbml0aW9uO1xufVxuLy8jZW5kcmVnaW9uXG5leHBvcnQgeyBkZWZpbmVDb250ZW50U2NyaXB0IH07XG4iLCJ0eXBlIFBob3RvSXRlbSA9IHtcbiAgaWQ6IHN0cmluZztcbiAgdGlsZTogSFRNTEVsZW1lbnQ7XG4gIGltYWdlPzogSFRNTEltYWdlRWxlbWVudDtcbiAgbGFiZWw6IHN0cmluZztcbiAgbW9udGg6IHN0cmluZztcbiAgdGh1bWJVcmw/OiBzdHJpbmc7XG59O1xuXG50eXBlIFNlc3Npb25TdGF0ZSA9IHtcbiAgYWN0aXZlOiBib29sZWFuO1xuICBtb250aDogc3RyaW5nO1xuICBxdWV1ZTogUGhvdG9JdGVtW107XG4gIGluZGV4OiBudW1iZXI7XG4gIHRyYXNoZWQ6IFBob3RvSXRlbVtdO1xuICBrZXB0OiBQaG90b0l0ZW1bXTtcbiAgcGVuZGluZ0NvbmZpcm06IGJvb2xlYW47XG4gIG1lc3NhZ2U6IHN0cmluZztcbn07XG5cbmNvbnN0IFJPT1RfSUQgPSAncGhvdG9zLXNwb25nZS1yb290JztcbmNvbnN0IFZJU0lCTEVfUEhPVE9fTUlOX1NJWkUgPSA4MDtcbmNvbnN0IE1PTlRIX0ZPUk1BVCA9IG5ldyBJbnRsLkRhdGVUaW1lRm9ybWF0KHVuZGVmaW5lZCwge1xuICBtb250aDogJ2xvbmcnLFxuICB5ZWFyOiAnbnVtZXJpYycsXG59KTtcblxuY29uc3Qgc3RhdGU6IFNlc3Npb25TdGF0ZSA9IHtcbiAgYWN0aXZlOiBmYWxzZSxcbiAgbW9udGg6ICcnLFxuICBxdWV1ZTogW10sXG4gIGluZGV4OiAwLFxuICB0cmFzaGVkOiBbXSxcbiAga2VwdDogW10sXG4gIHBlbmRpbmdDb25maXJtOiBmYWxzZSxcbiAgbWVzc2FnZTogJycsXG59O1xuXG5sZXQgcm9vdDogSFRNTERpdkVsZW1lbnQ7XG5sZXQgcGFuZWw6IEhUTUxEaXZFbGVtZW50O1xubGV0IHBob3RvU3RhZ2U6IEhUTUxEaXZFbGVtZW50O1xubGV0IG1vbnRoU2VsZWN0OiBIVE1MU2VsZWN0RWxlbWVudDtcbmxldCBzdGF0dXNMaW5lOiBIVE1MRGl2RWxlbWVudDtcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29udGVudFNjcmlwdCh7XG4gIG1hdGNoZXM6IFsnaHR0cHM6Ly9waG90b3MuZ29vZ2xlLmNvbS8qJ10sXG4gIHJ1bkF0OiAnZG9jdW1lbnRfaWRsZScsXG4gIG1haW4oKSB7XG4gICAgbW91bnRVaSgpO1xuICAgIHJlZnJlc2hNb250aE9wdGlvbnMoKTtcblxuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgaGFuZGxlS2V5ZG93biwgdHJ1ZSk7XG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3Njcm9sbCcsIGRlYm91bmNlKCgpID0+IHJlZnJlc2hNb250aE9wdGlvbnMoKSwgMzAwKSwgdHJ1ZSk7XG5cbiAgICBjb25zdCBvYnNlcnZlciA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKGRlYm91bmNlKCgpID0+IHJlZnJlc2hNb250aE9wdGlvbnMoKSwgNTAwKSk7XG4gICAgb2JzZXJ2ZXIub2JzZXJ2ZShkb2N1bWVudC5ib2R5LCB7IGNoaWxkTGlzdDogdHJ1ZSwgc3VidHJlZTogdHJ1ZSB9KTtcbiAgfSxcbn0pO1xuXG5mdW5jdGlvbiBtb3VudFVpKCkge1xuICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChST09UX0lEKT8ucmVtb3ZlKCk7XG5cbiAgcm9vdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICByb290LmlkID0gUk9PVF9JRDtcbiAgcm9vdC5hdHRhY2hTaGFkb3coeyBtb2RlOiAnb3BlbicgfSk7XG5cbiAgY29uc3Qgc3R5bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzdHlsZScpO1xuICBzdHlsZS50ZXh0Q29udGVudCA9IGBcbiAgICA6aG9zdCwgKiB7XG4gICAgICBib3gtc2l6aW5nOiBib3JkZXItYm94O1xuICAgIH1cblxuICAgIC5wYW5lbCB7XG4gICAgICBwb3NpdGlvbjogZml4ZWQ7XG4gICAgICByaWdodDogMThweDtcbiAgICAgIGJvdHRvbTogMThweDtcbiAgICAgIHotaW5kZXg6IDIxNDc0ODM2NDc7XG4gICAgICB3aWR0aDogbWluKDM4MHB4LCBjYWxjKDEwMHZ3IC0gMjRweCkpO1xuICAgICAgb3ZlcmZsb3c6IGhpZGRlbjtcbiAgICAgIGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMjIsIDMyLCAzOCwgMC4xNik7XG4gICAgICBib3JkZXItcmFkaXVzOiA4cHg7XG4gICAgICBiYWNrZ3JvdW5kOiAjZmJmY2ZkO1xuICAgICAgYm94LXNoYWRvdzogMCAxOHB4IDUwcHggcmdiYSgxNSwgMjMsIDQyLCAwLjI4KTtcbiAgICAgIGNvbG9yOiAjMTcyMDI2O1xuICAgICAgZm9udDogMTNweC8xLjM1IHN5c3RlbS11aSwgLWFwcGxlLXN5c3RlbSwgQmxpbmtNYWNTeXN0ZW1Gb250LCBcIlNlZ29lIFVJXCIsIHNhbnMtc2VyaWY7XG4gICAgfVxuXG4gICAgLnRvcGJhciB7XG4gICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICAgIGp1c3RpZnktY29udGVudDogc3BhY2UtYmV0d2VlbjtcbiAgICAgIGdhcDogMTJweDtcbiAgICAgIHBhZGRpbmc6IDEycHggMTRweDtcbiAgICAgIGJvcmRlci1ib3R0b206IDFweCBzb2xpZCAjZGJlNGVhO1xuICAgICAgYmFja2dyb3VuZDogI2ZmZmZmZjtcbiAgICB9XG5cbiAgICAudGl0bGUge1xuICAgICAgbWluLXdpZHRoOiAwO1xuICAgICAgZm9udC1zaXplOiAxNHB4O1xuICAgICAgZm9udC13ZWlnaHQ6IDcyMDtcbiAgICB9XG5cbiAgICAuYWN0aW9ucyxcbiAgICAua2V5cyB7XG4gICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICAgIGdhcDogOHB4O1xuICAgICAgZmxleC13cmFwOiB3cmFwO1xuICAgIH1cblxuICAgIGJ1dHRvbixcbiAgICBzZWxlY3Qge1xuICAgICAgaGVpZ2h0OiAzMnB4O1xuICAgICAgYm9yZGVyOiAxcHggc29saWQgI2M1ZDBkODtcbiAgICAgIGJvcmRlci1yYWRpdXM6IDZweDtcbiAgICAgIGJhY2tncm91bmQ6ICNmZmZmZmY7XG4gICAgICBjb2xvcjogIzE3MjAyNjtcbiAgICAgIGZvbnQ6IGluaGVyaXQ7XG4gICAgfVxuXG4gICAgYnV0dG9uIHtcbiAgICAgIGRpc3BsYXk6IGlubGluZS1mbGV4O1xuICAgICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICAgIGp1c3RpZnktY29udGVudDogY2VudGVyO1xuICAgICAgcGFkZGluZzogMCAxMHB4O1xuICAgICAgY3Vyc29yOiBwb2ludGVyO1xuICAgICAgZm9udC13ZWlnaHQ6IDY1MDtcbiAgICB9XG5cbiAgICBidXR0b24ucHJpbWFyeSB7XG4gICAgICBib3JkZXItY29sb3I6ICMwZjc2NmU7XG4gICAgICBiYWNrZ3JvdW5kOiAjMGY3NjZlO1xuICAgICAgY29sb3I6IHdoaXRlO1xuICAgIH1cblxuICAgIGJ1dHRvbi5kYW5nZXIge1xuICAgICAgYm9yZGVyLWNvbG9yOiAjYjQyMzE4O1xuICAgICAgYmFja2dyb3VuZDogI2I0MjMxODtcbiAgICAgIGNvbG9yOiB3aGl0ZTtcbiAgICB9XG5cbiAgICBidXR0b246ZGlzYWJsZWQge1xuICAgICAgY3Vyc29yOiBkZWZhdWx0O1xuICAgICAgb3BhY2l0eTogMC41O1xuICAgIH1cblxuICAgIHNlbGVjdCB7XG4gICAgICBtaW4td2lkdGg6IDA7XG4gICAgICBmbGV4OiAxO1xuICAgICAgcGFkZGluZzogMCAyOHB4IDAgOHB4O1xuICAgIH1cblxuICAgIC5ib2R5IHtcbiAgICAgIGRpc3BsYXk6IGdyaWQ7XG4gICAgICBnYXA6IDEycHg7XG4gICAgICBwYWRkaW5nOiAxMnB4IDE0cHggMTRweDtcbiAgICB9XG5cbiAgICAucGlja2VyIHtcbiAgICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgICBnYXA6IDhweDtcbiAgICB9XG5cbiAgICAuc3RhZ2Uge1xuICAgICAgZGlzcGxheTogZ3JpZDtcbiAgICAgIHBsYWNlLWl0ZW1zOiBjZW50ZXI7XG4gICAgICBtaW4taGVpZ2h0OiAxODBweDtcbiAgICAgIG92ZXJmbG93OiBoaWRkZW47XG4gICAgICBib3JkZXI6IDFweCBzb2xpZCAjZDllMmU4O1xuICAgICAgYm9yZGVyLXJhZGl1czogOHB4O1xuICAgICAgYmFja2dyb3VuZDogI2VlZjNmNjtcbiAgICB9XG5cbiAgICAuc3RhZ2UgaW1nIHtcbiAgICAgIGRpc3BsYXk6IGJsb2NrO1xuICAgICAgbWF4LXdpZHRoOiAxMDAlO1xuICAgICAgbWF4LWhlaWdodDogMzIwcHg7XG4gICAgICBvYmplY3QtZml0OiBjb250YWluO1xuICAgIH1cblxuICAgIC5lbXB0eSB7XG4gICAgICBtYXgtd2lkdGg6IDI4Y2g7XG4gICAgICBwYWRkaW5nOiAyNHB4IDE4cHg7XG4gICAgICBjb2xvcjogIzQ2NWE2NTtcbiAgICAgIHRleHQtYWxpZ246IGNlbnRlcjtcbiAgICB9XG5cbiAgICAubWV0YSB7XG4gICAgICBkaXNwbGF5OiBncmlkO1xuICAgICAgZ2FwOiA0cHg7XG4gICAgICBtaW4td2lkdGg6IDA7XG4gICAgfVxuXG4gICAgLnBob3RvLWxhYmVsIHtcbiAgICAgIG92ZXJmbG93OiBoaWRkZW47XG4gICAgICBjb2xvcjogIzE3MjAyNjtcbiAgICAgIGZvbnQtd2VpZ2h0OiA2NTA7XG4gICAgICB0ZXh0LW92ZXJmbG93OiBlbGxpcHNpcztcbiAgICAgIHdoaXRlLXNwYWNlOiBub3dyYXA7XG4gICAgfVxuXG4gICAgLnN0YXR1cyB7XG4gICAgICBjb2xvcjogIzUyNjY3MjtcbiAgICB9XG5cbiAgICAua2V5cyB7XG4gICAgICBqdXN0aWZ5LWNvbnRlbnQ6IHNwYWNlLWJldHdlZW47XG4gICAgfVxuXG4gICAgLmtleSB7XG4gICAgICBkaXNwbGF5OiBpbmxpbmUtZmxleDtcbiAgICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gICAgICBnYXA6IDZweDtcbiAgICAgIHdoaXRlLXNwYWNlOiBub3dyYXA7XG4gICAgfVxuXG4gICAga2JkIHtcbiAgICAgIG1pbi13aWR0aDogMjJweDtcbiAgICAgIHBhZGRpbmc6IDJweCA2cHg7XG4gICAgICBib3JkZXI6IDFweCBzb2xpZCAjYjljNWNlO1xuICAgICAgYm9yZGVyLWJvdHRvbS13aWR0aDogMnB4O1xuICAgICAgYm9yZGVyLXJhZGl1czogNHB4O1xuICAgICAgYmFja2dyb3VuZDogI2ZmZmZmZjtcbiAgICAgIGNvbG9yOiAjMTcyMDI2O1xuICAgICAgZm9udDogMTJweCB1aS1tb25vc3BhY2UsIFNGTW9uby1SZWd1bGFyLCBNZW5sbywgbW9ub3NwYWNlO1xuICAgICAgdGV4dC1hbGlnbjogY2VudGVyO1xuICAgIH1cblxuICAgIC5jb25maXJtIHtcbiAgICAgIGRpc3BsYXk6IGdyaWQ7XG4gICAgICBnYXA6IDEwcHg7XG4gICAgICBwYWRkaW5nOiAxMnB4O1xuICAgICAgYm9yZGVyOiAxcHggc29saWQgI2YyYjhiNTtcbiAgICAgIGJvcmRlci1yYWRpdXM6IDhweDtcbiAgICAgIGJhY2tncm91bmQ6ICNmZmY3ZjY7XG4gICAgfVxuXG4gICAgLmNvbmZpcm0gc3Ryb25nIHtcbiAgICAgIGNvbG9yOiAjOGMxZDE4O1xuICAgIH1cbiAgYDtcblxuICBwYW5lbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICBwYW5lbC5jbGFzc05hbWUgPSAncGFuZWwnO1xuICBwYW5lbC5pbm5lckhUTUwgPSBgXG4gICAgPGRpdiBjbGFzcz1cInRvcGJhclwiPlxuICAgICAgPGRpdiBjbGFzcz1cInRpdGxlXCI+UGhvdG9zIFNwb25nZTwvZGl2PlxuICAgICAgPGRpdiBjbGFzcz1cImFjdGlvbnNcIj5cbiAgICAgICAgPGJ1dHRvbiB0eXBlPVwiYnV0dG9uXCIgZGF0YS1hY3Rpb249XCJyZWZyZXNoXCIgdGl0bGU9XCJSZWZyZXNoIHZpc2libGUgcGhvdG9zXCI+UmVmcmVzaDwvYnV0dG9uPlxuICAgICAgICA8YnV0dG9uIHR5cGU9XCJidXR0b25cIiBkYXRhLWFjdGlvbj1cImhpZGVcIiB0aXRsZT1cIkhpZGUgcGFuZWxcIj5IaWRlPC9idXR0b24+XG4gICAgICA8L2Rpdj5cbiAgICA8L2Rpdj5cbiAgICA8ZGl2IGNsYXNzPVwiYm9keVwiPlxuICAgICAgPGRpdiBjbGFzcz1cInBpY2tlclwiPlxuICAgICAgICA8c2VsZWN0IGFyaWEtbGFiZWw9XCJNb250aCB0byByZXZpZXdcIj48L3NlbGVjdD5cbiAgICAgICAgPGJ1dHRvbiB0eXBlPVwiYnV0dG9uXCIgY2xhc3M9XCJwcmltYXJ5XCIgZGF0YS1hY3Rpb249XCJzdGFydFwiPlN0YXJ0PC9idXR0b24+XG4gICAgICA8L2Rpdj5cbiAgICAgIDxkaXYgY2xhc3M9XCJzdGFnZVwiPjxkaXYgY2xhc3M9XCJlbXB0eVwiPlNjcm9sbCBHb29nbGUgUGhvdG9zIHRvIGEgbW9udGgsIGNob29zZSBpdCBoZXJlLCB0aGVuIHN0YXJ0LjwvZGl2PjwvZGl2PlxuICAgICAgPGRpdiBjbGFzcz1cIm1ldGFcIj5cbiAgICAgICAgPGRpdiBjbGFzcz1cInBob3RvLWxhYmVsXCI+Tm8gcmV2aWV3IHJ1bm5pbmc8L2Rpdj5cbiAgICAgICAgPGRpdiBjbGFzcz1cInN0YXR1c1wiPlZpc2libGUgcGhvdG9zIGFyZSBncm91cGVkIGJ5IHRoZWlyIEdvb2dsZSBQaG90b3MgbGFiZWxzLjwvZGl2PlxuICAgICAgPC9kaXY+XG4gICAgICA8ZGl2IGNsYXNzPVwia2V5c1wiPlxuICAgICAgICA8c3BhbiBjbGFzcz1cImtleVwiPjxrYmQ+WTwva2JkPiBrZWVwPC9zcGFuPlxuICAgICAgICA8c3BhbiBjbGFzcz1cImtleVwiPjxrYmQ+Tjwva2JkPiB0cmFzaDwvc3Bhbj5cbiAgICAgICAgPHNwYW4gY2xhc3M9XCJrZXlcIj48a2JkPlU8L2tiZD4gdW5kbzwvc3Bhbj5cbiAgICAgICAgPHNwYW4gY2xhc3M9XCJrZXlcIj48a2JkPkVzYzwva2JkPiBzdG9wPC9zcGFuPlxuICAgICAgPC9kaXY+XG4gICAgPC9kaXY+XG4gIGA7XG5cbiAgcm9vdC5zaGFkb3dSb290Py5hcHBlbmQoc3R5bGUsIHBhbmVsKTtcbiAgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LmFwcGVuZChyb290KTtcblxuICBwaG90b1N0YWdlID0gbXVzdEZpbmQoJy5zdGFnZScpO1xuICBtb250aFNlbGVjdCA9IG11c3RGaW5kKCdzZWxlY3QnKTtcbiAgc3RhdHVzTGluZSA9IG11c3RGaW5kKCcuc3RhdHVzJyk7XG5cbiAgcm9vdC5zaGFkb3dSb290Py5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChldmVudCkgPT4ge1xuICAgIGNvbnN0IHRhcmdldCA9IGV2ZW50LnRhcmdldCBhcyBIVE1MRWxlbWVudDtcbiAgICBjb25zdCBidXR0b24gPSB0YXJnZXQuY2xvc2VzdDxIVE1MQnV0dG9uRWxlbWVudD4oJ2J1dHRvbltkYXRhLWFjdGlvbl0nKTtcbiAgICBpZiAoIWJ1dHRvbikgcmV0dXJuO1xuXG4gICAgY29uc3QgYWN0aW9uID0gYnV0dG9uLmRhdGFzZXQuYWN0aW9uO1xuICAgIGlmIChhY3Rpb24gPT09ICdyZWZyZXNoJykgcmVmcmVzaE1vbnRoT3B0aW9ucyh0cnVlKTtcbiAgICBpZiAoYWN0aW9uID09PSAnaGlkZScpIHJvb3QuaGlkZGVuID0gdHJ1ZTtcbiAgICBpZiAoYWN0aW9uID09PSAnc3RhcnQnKSBzdGFydE1vbnRoKCk7XG4gICAgaWYgKGFjdGlvbiA9PT0gJ2NvbmZpcm0tZGVsZXRlJykgdHJhc2hNYXJrZWRQaG90b3MoKTtcbiAgICBpZiAoYWN0aW9uID09PSAnY2FuY2VsLWRlbGV0ZScpIHJlc2V0U2Vzc2lvbignRGVsZXRpb24gY2FuY2VsbGVkLiBZb3VyIG1hcmtlZCBwaG90b3Mgd2VyZSBub3QgY2hhbmdlZC4nKTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGhhbmRsZUtleWRvd24oZXZlbnQ6IEtleWJvYXJkRXZlbnQpIHtcbiAgaWYgKGV2ZW50LnRhcmdldCBpbnN0YW5jZW9mIEhUTUxJbnB1dEVsZW1lbnQgfHwgZXZlbnQudGFyZ2V0IGluc3RhbmNlb2YgSFRNTFRleHRBcmVhRWxlbWVudCkgcmV0dXJuO1xuICBpZiAocm9vdC5oaWRkZW4gJiYgZXZlbnQua2V5LnRvTG93ZXJDYXNlKCkgPT09ICdzJykge1xuICAgIHJvb3QuaGlkZGVuID0gZmFsc2U7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoIXN0YXRlLmFjdGl2ZSkgcmV0dXJuO1xuXG4gIGNvbnN0IGtleSA9IGV2ZW50LmtleS50b0xvd2VyQ2FzZSgpO1xuICBpZiAoa2V5ID09PSAneScpIHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGRlY2lkZUN1cnJlbnQoJ2tlZXAnKTtcbiAgfVxuICBpZiAoa2V5ID09PSAnbicpIHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGRlY2lkZUN1cnJlbnQoJ3RyYXNoJyk7XG4gIH1cbiAgaWYgKGtleSA9PT0gJ3UnKSB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICB1bmRvRGVjaXNpb24oKTtcbiAgfVxuICBpZiAoa2V5ID09PSAnZXNjYXBlJykge1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgcmVzZXRTZXNzaW9uKCdTdG9wcGVkLiBObyBHb29nbGUgUGhvdG9zIGNoYW5nZXMgd2VyZSBtYWRlLicpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHN0YXJ0TW9udGgoKSB7XG4gIGNvbnN0IG1vbnRoID0gbW9udGhTZWxlY3QudmFsdWU7XG4gIGNvbnN0IGl0ZW1zID0gY29sbGVjdFBob3RvcygpLmZpbHRlcigoaXRlbSkgPT4gaXRlbS5tb250aCA9PT0gbW9udGgpO1xuXG4gIHN0YXRlLmFjdGl2ZSA9IHRydWU7XG4gIHN0YXRlLm1vbnRoID0gbW9udGg7XG4gIHN0YXRlLnF1ZXVlID0gaXRlbXM7XG4gIHN0YXRlLmluZGV4ID0gMDtcbiAgc3RhdGUudHJhc2hlZCA9IFtdO1xuICBzdGF0ZS5rZXB0ID0gW107XG4gIHN0YXRlLnBlbmRpbmdDb25maXJtID0gZmFsc2U7XG4gIHN0YXRlLm1lc3NhZ2UgPSAnJztcblxuICBpZiAoaXRlbXMubGVuZ3RoID09PSAwKSB7XG4gICAgcmVzZXRTZXNzaW9uKCdObyB2aXNpYmxlIHBob3RvcyBmb3VuZCBmb3IgdGhhdCBtb250aC4gU2Nyb2xsIHRoZSBncmlkIGFuZCByZWZyZXNoLicpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHJlbmRlckN1cnJlbnQoKTtcbn1cblxuZnVuY3Rpb24gZGVjaWRlQ3VycmVudChkZWNpc2lvbjogJ2tlZXAnIHwgJ3RyYXNoJykge1xuICBpZiAoc3RhdGUucGVuZGluZ0NvbmZpcm0pIHJldHVybjtcblxuICBjb25zdCBjdXJyZW50ID0gc3RhdGUucXVldWVbc3RhdGUuaW5kZXhdO1xuICBpZiAoIWN1cnJlbnQpIHJldHVybjtcblxuICBpZiAoZGVjaXNpb24gPT09ICd0cmFzaCcpIHN0YXRlLnRyYXNoZWQucHVzaChjdXJyZW50KTtcbiAgZWxzZSBzdGF0ZS5rZXB0LnB1c2goY3VycmVudCk7XG5cbiAgc3RhdGUuaW5kZXggKz0gMTtcblxuICBpZiAoc3RhdGUuaW5kZXggPj0gc3RhdGUucXVldWUubGVuZ3RoKSB7XG4gICAgc3RhdGUucGVuZGluZ0NvbmZpcm0gPSB0cnVlO1xuICAgIHJlbmRlckNvbmZpcm0oKTtcbiAgICByZXR1cm47XG4gIH1cblxuICByZW5kZXJDdXJyZW50KCk7XG59XG5cbmZ1bmN0aW9uIHVuZG9EZWNpc2lvbigpIHtcbiAgaWYgKHN0YXRlLnBlbmRpbmdDb25maXJtKSB7XG4gICAgc3RhdGUucGVuZGluZ0NvbmZpcm0gPSBmYWxzZTtcbiAgICBzdGF0ZS5pbmRleCA9IE1hdGgubWF4KDAsIHN0YXRlLnF1ZXVlLmxlbmd0aCAtIDEpO1xuICB9IGVsc2UgaWYgKHN0YXRlLmluZGV4ID4gMCkge1xuICAgIHN0YXRlLmluZGV4IC09IDE7XG4gIH1cblxuICBjb25zdCBjdXJyZW50ID0gc3RhdGUucXVldWVbc3RhdGUuaW5kZXhdO1xuICBzdGF0ZS50cmFzaGVkID0gc3RhdGUudHJhc2hlZC5maWx0ZXIoKGl0ZW0pID0+IGl0ZW0uaWQgIT09IGN1cnJlbnQ/LmlkKTtcbiAgc3RhdGUua2VwdCA9IHN0YXRlLmtlcHQuZmlsdGVyKChpdGVtKSA9PiBpdGVtLmlkICE9PSBjdXJyZW50Py5pZCk7XG4gIHJlbmRlckN1cnJlbnQoKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gdHJhc2hNYXJrZWRQaG90b3MoKSB7XG4gIHN0YXRlLnBlbmRpbmdDb25maXJtID0gZmFsc2U7XG5cbiAgaWYgKHN0YXRlLnRyYXNoZWQubGVuZ3RoID09PSAwKSB7XG4gICAgcmVzZXRTZXNzaW9uKCdGaW5pc2hlZC4gTm90aGluZyB3YXMgbWFya2VkIGZvciB0cmFzaC4nKTtcbiAgICByZXR1cm47XG4gIH1cblxuICB1cGRhdGVTdGF0dXMoYFNlbGVjdGluZyAke3N0YXRlLnRyYXNoZWQubGVuZ3RofSBtYXJrZWQgcGhvdG8ke3BsdXJhbChzdGF0ZS50cmFzaGVkLmxlbmd0aCl9Li4uYCk7XG5cbiAgY29uc3Qgc2VsZWN0ZWQ6IFBob3RvSXRlbVtdID0gW107XG4gIGZvciAoY29uc3QgaXRlbSBvZiBzdGF0ZS50cmFzaGVkKSB7XG4gICAgaWYgKGF3YWl0IHNlbGVjdFBob3RvKGl0ZW0pKSBzZWxlY3RlZC5wdXNoKGl0ZW0pO1xuICAgIGF3YWl0IHdhaXQoOTApO1xuICB9XG5cbiAgaWYgKHNlbGVjdGVkLmxlbmd0aCA9PT0gMCkge1xuICAgIHJlc2V0U2Vzc2lvbignSSBjb3VsZCBub3QgZmluZCBHb29nbGUgUGhvdG9zIHNlbGVjdGlvbiBjb250cm9scyBmb3IgdGhlIG1hcmtlZCBwaG90b3MuIE5vdGhpbmcgd2FzIGRlbGV0ZWQuJyk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdXBkYXRlU3RhdHVzKGBTZWxlY3RlZCAke3NlbGVjdGVkLmxlbmd0aH0uIE9wZW5pbmcgR29vZ2xlIFBob3RvcyB0cmFzaCBhY3Rpb24uLi5gKTtcbiAgYXdhaXQgd2FpdCgyNTApO1xuXG4gIGNvbnN0IHRyYXNoQnV0dG9uID0gZmluZFRyYXNoQnV0dG9uKCk7XG4gIGlmICghdHJhc2hCdXR0b24pIHtcbiAgICByZXNldFNlc3Npb24oJ1NlbGVjdGVkIHRoZSBtYXJrZWQgcGhvdG9zLCBidXQgY291bGQgbm90IGZpbmQgdGhlIEdvb2dsZSBQaG90b3MgdHJhc2ggYnV0dG9uLiBVc2UgdGhlIHRvb2xiYXIgdHJhc2ggaWNvbiB0byBmaW5pc2guJyk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdHJhc2hCdXR0b24uY2xpY2soKTtcbiAgYXdhaXQgd2FpdCgzMDApO1xuXG4gIGNvbnN0IGNvbmZpcm1CdXR0b24gPSBmaW5kRGlhbG9nQ29uZmlybUJ1dHRvbigpO1xuICBpZiAoY29uZmlybUJ1dHRvbikge1xuICAgIGNvbmZpcm1CdXR0b24uY2xpY2soKTtcbiAgICByZXNldFNlc3Npb24oYFNlbnQgJHtzZWxlY3RlZC5sZW5ndGh9IHBob3RvJHtwbHVyYWwoc2VsZWN0ZWQubGVuZ3RoKX0gdG8gR29vZ2xlIFBob3RvcyB0cmFzaC5gKTtcbiAgfSBlbHNlIHtcbiAgICByZXNldFNlc3Npb24oYE9wZW5lZCB0aGUgR29vZ2xlIFBob3RvcyB0cmFzaCBhY3Rpb24gZm9yICR7c2VsZWN0ZWQubGVuZ3RofSBzZWxlY3RlZCBwaG90byR7cGx1cmFsKHNlbGVjdGVkLmxlbmd0aCl9LiBDb25maXJtIHRoZSBHb29nbGUgUGhvdG9zIGRpYWxvZyB0byBmaW5pc2guYCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gY29sbGVjdFBob3RvcygpOiBQaG90b0l0ZW1bXSB7XG4gIGNvbnN0IGNhbmRpZGF0ZXMgPSBuZXcgU2V0PEhUTUxFbGVtZW50PigpO1xuICBjb25zdCBzZWxlY3RvcnMgPSBbXG4gICAgJ1tyb2xlPVwiZ3JpZGNlbGxcIl0nLFxuICAgICdhW2hyZWYqPVwiL3Bob3RvL1wiXScsXG4gICAgJ2RpdlthcmlhLWxhYmVsXVt0YWJpbmRleF0nLFxuICAgICdkaXZbanNhY3Rpb25dW2FyaWEtbGFiZWxdJyxcbiAgXTtcblxuICBmb3IgKGNvbnN0IHNlbGVjdG9yIG9mIHNlbGVjdG9ycykge1xuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KHNlbGVjdG9yKS5mb3JFYWNoKChlbGVtZW50KSA9PiB7XG4gICAgICBpZiAoZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdpbWcnKSkgY2FuZGlkYXRlcy5hZGQoZWxlbWVudCk7XG4gICAgfSk7XG4gIH1cblxuICBjb25zdCBwaG90b3MgPSBBcnJheS5mcm9tKGNhbmRpZGF0ZXMpXG4gICAgLmZpbHRlcihpc1Zpc2libGVQaG90b1RpbGUpXG4gICAgLm1hcCh0b1Bob3RvSXRlbSlcbiAgICAuZmlsdGVyKChpdGVtKTogaXRlbSBpcyBQaG90b0l0ZW0gPT4gaXRlbSAhPT0gbnVsbCk7XG5cbiAgY29uc3Qgc2VlbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICByZXR1cm4gcGhvdG9zLmZpbHRlcigoaXRlbSkgPT4ge1xuICAgIGlmIChzZWVuLmhhcyhpdGVtLmlkKSkgcmV0dXJuIGZhbHNlO1xuICAgIHNlZW4uYWRkKGl0ZW0uaWQpO1xuICAgIHJldHVybiB0cnVlO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gdG9QaG90b0l0ZW0odGlsZTogSFRNTEVsZW1lbnQpOiBQaG90b0l0ZW0gfCBudWxsIHtcbiAgY29uc3QgaW1hZ2UgPSB0aWxlLnF1ZXJ5U2VsZWN0b3I8SFRNTEltYWdlRWxlbWVudD4oJ2ltZycpID8/IHVuZGVmaW5lZDtcbiAgY29uc3QgbGFiZWwgPSBub3JtYWxpemVUZXh0KFxuICAgIHRpbGUuZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJykgPz9cbiAgICAgIGltYWdlPy5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKSA/P1xuICAgICAgaW1hZ2U/LmFsdCA/P1xuICAgICAgbmVhcmVzdFRleHRMYWJlbCh0aWxlKSA/P1xuICAgICAgJ1Zpc2libGUgcGhvdG8nLFxuICApO1xuICBjb25zdCBtb250aCA9IG1vbnRoRnJvbUxhYmVsKGxhYmVsKSA/PyBtb250aEZyb21OZWFyYnlIZWFkaW5nKHRpbGUpID8/ICdWaXNpYmxlIHBob3Rvcyc7XG4gIGNvbnN0IHRodW1iVXJsID0gaW1hZ2U/LmN1cnJlbnRTcmMgfHwgaW1hZ2U/LnNyYyB8fCB1bmRlZmluZWQ7XG4gIGNvbnN0IGlkID0gW1xuICAgIHRpbGUuZ2V0QXR0cmlidXRlKCdkYXRhLWlkJyksXG4gICAgdGlsZS5nZXRBdHRyaWJ1dGUoJ2hyZWYnKSxcbiAgICBsYWJlbCxcbiAgICB0aHVtYlVybCxcbiAgICBNYXRoLnJvdW5kKHRpbGUuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkudG9wICsgd2luZG93LnNjcm9sbFkpLFxuICBdXG4gICAgLmZpbHRlcihCb29sZWFuKVxuICAgIC5qb2luKCd8Jyk7XG5cbiAgcmV0dXJuIHsgaWQsIHRpbGUsIGltYWdlLCBsYWJlbCwgbW9udGgsIHRodW1iVXJsIH07XG59XG5cbmZ1bmN0aW9uIHJlZnJlc2hNb250aE9wdGlvbnMoc2hvd01lc3NhZ2UgPSBmYWxzZSkge1xuICBpZiAoIW1vbnRoU2VsZWN0KSByZXR1cm47XG5cbiAgY29uc3QgcHJldmlvdXMgPSBtb250aFNlbGVjdC52YWx1ZTtcbiAgY29uc3QgbW9udGhDb3VudHMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuICBmb3IgKGNvbnN0IHBob3RvIG9mIGNvbGxlY3RQaG90b3MoKSkge1xuICAgIG1vbnRoQ291bnRzLnNldChwaG90by5tb250aCwgKG1vbnRoQ291bnRzLmdldChwaG90by5tb250aCkgPz8gMCkgKyAxKTtcbiAgfVxuXG4gIG1vbnRoU2VsZWN0LnJlcGxhY2VDaGlsZHJlbihcbiAgICAuLi5BcnJheS5mcm9tKG1vbnRoQ291bnRzLmVudHJpZXMoKSkubWFwKChbbW9udGgsIGNvdW50XSkgPT4ge1xuICAgICAgY29uc3Qgb3B0aW9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnb3B0aW9uJyk7XG4gICAgICBvcHRpb24udmFsdWUgPSBtb250aDtcbiAgICAgIG9wdGlvbi50ZXh0Q29udGVudCA9IGAke21vbnRofSAoJHtjb3VudH0pYDtcbiAgICAgIHJldHVybiBvcHRpb247XG4gICAgfSksXG4gICk7XG5cbiAgaWYgKHByZXZpb3VzICYmIG1vbnRoQ291bnRzLmhhcyhwcmV2aW91cykpIG1vbnRoU2VsZWN0LnZhbHVlID0gcHJldmlvdXM7XG5cbiAgaWYgKG1vbnRoQ291bnRzLnNpemUgPT09IDApIHtcbiAgICBjb25zdCBvcHRpb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdvcHRpb24nKTtcbiAgICBvcHRpb24udmFsdWUgPSAnJztcbiAgICBvcHRpb24udGV4dENvbnRlbnQgPSAnTm8gdmlzaWJsZSBtb250aHMgZm91bmQnO1xuICAgIG1vbnRoU2VsZWN0LmFwcGVuZChvcHRpb24pO1xuICB9XG5cbiAgaWYgKHNob3dNZXNzYWdlKSB1cGRhdGVTdGF0dXMoYFJlZnJlc2hlZC4gRm91bmQgJHtzdW0obW9udGhDb3VudHMpfSB2aXNpYmxlIHBob3RvJHtwbHVyYWwoc3VtKG1vbnRoQ291bnRzKSl9LmApO1xufVxuXG5mdW5jdGlvbiByZW5kZXJDdXJyZW50KCkge1xuICBjb25zdCBjdXJyZW50ID0gc3RhdGUucXVldWVbc3RhdGUuaW5kZXhdO1xuICBpZiAoIWN1cnJlbnQpIHtcbiAgICByZW5kZXJDb25maXJtKCk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgcGhvdG9TdGFnZS5yZXBsYWNlQ2hpbGRyZW4oKTtcbiAgaWYgKGN1cnJlbnQudGh1bWJVcmwpIHtcbiAgICBjb25zdCBwcmV2aWV3ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnaW1nJyk7XG4gICAgcHJldmlldy5zcmMgPSBjdXJyZW50LnRodW1iVXJsO1xuICAgIHByZXZpZXcuYWx0ID0gY3VycmVudC5sYWJlbDtcbiAgICBwaG90b1N0YWdlLmFwcGVuZChwcmV2aWV3KTtcbiAgfSBlbHNlIHtcbiAgICBjb25zdCBlbXB0eSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIGVtcHR5LmNsYXNzTmFtZSA9ICdlbXB0eSc7XG4gICAgZW1wdHkudGV4dENvbnRlbnQgPSAnUHJldmlldyB1bmF2YWlsYWJsZS4gVXNlIHRoZSBoaWdobGlnaHRlZCB0aWxlIGluIEdvb2dsZSBQaG90b3MuJztcbiAgICBwaG90b1N0YWdlLmFwcGVuZChlbXB0eSk7XG4gIH1cblxuICBjb25zdCBsYWJlbCA9IG11c3RGaW5kKCcucGhvdG8tbGFiZWwnKTtcbiAgbGFiZWwudGV4dENvbnRlbnQgPSBjdXJyZW50LmxhYmVsO1xuICBjdXJyZW50LnRpbGUuc2Nyb2xsSW50b1ZpZXcoeyBibG9jazogJ2NlbnRlcicsIGlubGluZTogJ2NlbnRlcicsIGJlaGF2aW9yOiAnc21vb3RoJyB9KTtcbiAgZmxhc2hUaWxlKGN1cnJlbnQudGlsZSk7XG4gIHVwZGF0ZVN0YXR1cyhcbiAgICBgJHtzdGF0ZS5tb250aH06ICR7c3RhdGUuaW5kZXggKyAxfS8ke3N0YXRlLnF1ZXVlLmxlbmd0aH0uIGAgK1xuICAgICAgYCR7c3RhdGUudHJhc2hlZC5sZW5ndGh9IG1hcmtlZCBmb3IgdHJhc2gsICR7c3RhdGUua2VwdC5sZW5ndGh9IGtlcHQuYCxcbiAgKTtcbn1cblxuZnVuY3Rpb24gcmVuZGVyQ29uZmlybSgpIHtcbiAgcGhvdG9TdGFnZS5pbm5lckhUTUwgPSBgXG4gICAgPGRpdiBjbGFzcz1cImNvbmZpcm1cIj5cbiAgICAgIDxzdHJvbmc+Q29uZmlybSBiZWZvcmUgZGVsZXRpbmc8L3N0cm9uZz5cbiAgICAgIDxzcGFuPiR7c3RhdGUudHJhc2hlZC5sZW5ndGh9IHBob3RvJHtwbHVyYWwoc3RhdGUudHJhc2hlZC5sZW5ndGgpfSBtYXJrZWQgZm9yIHRyYXNoIGZyb20gJHtlc2NhcGVIdG1sKHN0YXRlLm1vbnRoKX0uPC9zcGFuPlxuICAgICAgPGRpdiBjbGFzcz1cImFjdGlvbnNcIj5cbiAgICAgICAgPGJ1dHRvbiB0eXBlPVwiYnV0dG9uXCIgY2xhc3M9XCJkYW5nZXJcIiBkYXRhLWFjdGlvbj1cImNvbmZpcm0tZGVsZXRlXCI+TW92ZSB0byB0cmFzaDwvYnV0dG9uPlxuICAgICAgICA8YnV0dG9uIHR5cGU9XCJidXR0b25cIiBkYXRhLWFjdGlvbj1cImNhbmNlbC1kZWxldGVcIj5DYW5jZWw8L2J1dHRvbj5cbiAgICAgIDwvZGl2PlxuICAgIDwvZGl2PlxuICBgO1xuXG4gIGNvbnN0IGxhYmVsID0gbXVzdEZpbmQoJy5waG90by1sYWJlbCcpO1xuICBsYWJlbC50ZXh0Q29udGVudCA9ICdNb250aCBjb21wbGV0ZSc7XG4gIHVwZGF0ZVN0YXR1cyhgJHtzdGF0ZS5rZXB0Lmxlbmd0aH0ga2VwdC4gUHJlc3MgVSB0byByZXZpZXcgdGhlIGxhc3QgcGhvdG8gYWdhaW4uYCk7XG59XG5cbmZ1bmN0aW9uIHJlc2V0U2Vzc2lvbihtZXNzYWdlOiBzdHJpbmcpIHtcbiAgc3RhdGUuYWN0aXZlID0gZmFsc2U7XG4gIHN0YXRlLm1vbnRoID0gJyc7XG4gIHN0YXRlLnF1ZXVlID0gW107XG4gIHN0YXRlLmluZGV4ID0gMDtcbiAgc3RhdGUudHJhc2hlZCA9IFtdO1xuICBzdGF0ZS5rZXB0ID0gW107XG4gIHN0YXRlLnBlbmRpbmdDb25maXJtID0gZmFsc2U7XG4gIHN0YXRlLm1lc3NhZ2UgPSBtZXNzYWdlO1xuXG4gIGNvbnN0IGxhYmVsID0gbXVzdEZpbmQoJy5waG90by1sYWJlbCcpO1xuICBsYWJlbC50ZXh0Q29udGVudCA9ICdObyByZXZpZXcgcnVubmluZyc7XG4gIHBob3RvU3RhZ2UuaW5uZXJIVE1MID0gYDxkaXYgY2xhc3M9XCJlbXB0eVwiPiR7ZXNjYXBlSHRtbChtZXNzYWdlKX08L2Rpdj5gO1xuICB1cGRhdGVTdGF0dXMobWVzc2FnZSk7XG4gIHJlZnJlc2hNb250aE9wdGlvbnMoKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gc2VsZWN0UGhvdG8oaXRlbTogUGhvdG9JdGVtKTogUHJvbWlzZTxib29sZWFuPiB7XG4gIGNvbnN0IGZyZXNoVGlsZSA9IGZpbmRGcmVzaFRpbGUoaXRlbSkgPz8gaXRlbS50aWxlO1xuICBmcmVzaFRpbGUuc2Nyb2xsSW50b1ZpZXcoeyBibG9jazogJ2NlbnRlcicsIGlubGluZTogJ2NlbnRlcicsIGJlaGF2aW9yOiAnc21vb3RoJyB9KTtcbiAgYXdhaXQgd2FpdCgxODApO1xuXG4gIGNvbnN0IHNlbGVjdENvbnRyb2wgPSBmaW5kU2VsZWN0Q29udHJvbChmcmVzaFRpbGUpO1xuICBpZiAoc2VsZWN0Q29udHJvbCkge1xuICAgIHNlbGVjdENvbnRyb2wuY2xpY2soKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGNvbnN0IGNoZWNrYm94ID0gZnJlc2hUaWxlLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCdbcm9sZT1cImNoZWNrYm94XCJdJyk7XG4gIGlmIChjaGVja2JveCkge1xuICAgIGNoZWNrYm94LmNsaWNrKCk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICByZXR1cm4gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIGZpbmRGcmVzaFRpbGUoaXRlbTogUGhvdG9JdGVtKTogSFRNTEVsZW1lbnQgfCBudWxsIHtcbiAgcmV0dXJuIGNvbGxlY3RQaG90b3MoKS5maW5kKChjYW5kaWRhdGUpID0+IGNhbmRpZGF0ZS5pZCA9PT0gaXRlbS5pZCB8fCBjYW5kaWRhdGUubGFiZWwgPT09IGl0ZW0ubGFiZWwpPy50aWxlID8/IG51bGw7XG59XG5cbmZ1bmN0aW9uIGZpbmRTZWxlY3RDb250cm9sKHRpbGU6IEhUTUxFbGVtZW50KTogSFRNTEVsZW1lbnQgfCBudWxsIHtcbiAgY29uc3QgY29udHJvbHMgPSBBcnJheS5mcm9tKHRpbGUucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oJ2J1dHRvbiwgW3JvbGU9XCJidXR0b25cIl0sIFthcmlhLWxhYmVsXScpKTtcbiAgcmV0dXJuIChcbiAgICBjb250cm9scy5maW5kKChjb250cm9sKSA9PiAvc2VsZWN0fGNoZWNrfHRpY2svaS50ZXN0KGNvbnRyb2wuZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJykgPz8gJycpKSA/P1xuICAgIGNvbnRyb2xzLmZpbmQoKGNvbnRyb2wpID0+IHtcbiAgICAgIGNvbnN0IHJlY3QgPSBjb250cm9sLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgY29uc3QgdGlsZVJlY3QgPSB0aWxlLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgcmV0dXJuIHJlY3Qud2lkdGggPiAxMiAmJiByZWN0LmhlaWdodCA+IDEyICYmIHJlY3QubGVmdCA8IHRpbGVSZWN0LmxlZnQgKyB0aWxlUmVjdC53aWR0aCAqIDAuNDU7XG4gICAgfSkgPz9cbiAgICBudWxsXG4gICk7XG59XG5cbmZ1bmN0aW9uIGZpbmRUcmFzaEJ1dHRvbigpOiBIVE1MRWxlbWVudCB8IG51bGwge1xuICBjb25zdCBjb250cm9scyA9IEFycmF5LmZyb20oZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oJ2J1dHRvbiwgW3JvbGU9XCJidXR0b25cIl0nKSk7XG4gIHJldHVybiBjb250cm9scy5maW5kKChlbGVtZW50KSA9PiAvdHJhc2h8ZGVsZXRlfGJpbnxyZW1vdmUvaS50ZXN0KGFjY2Vzc2libGVOYW1lKGVsZW1lbnQpKSkgPz8gbnVsbDtcbn1cblxuZnVuY3Rpb24gZmluZERpYWxvZ0NvbmZpcm1CdXR0b24oKTogSFRNTEVsZW1lbnQgfCBudWxsIHtcbiAgY29uc3QgZGlhbG9ncyA9IEFycmF5LmZyb20oZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oJ1tyb2xlPVwiZGlhbG9nXCJdLCBbYXJpYS1tb2RhbD1cInRydWVcIl0nKSk7XG4gIGNvbnN0IHNjb3BlID0gZGlhbG9ncy5hdCgtMSkgPz8gZG9jdW1lbnQuYm9keTtcbiAgY29uc3QgYnV0dG9ucyA9IEFycmF5LmZyb20oc2NvcGUucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oJ2J1dHRvbiwgW3JvbGU9XCJidXR0b25cIl0nKSk7XG4gIHJldHVybiBidXR0b25zLmZpbmQoKGJ1dHRvbikgPT4gL21vdmUgdG8gdHJhc2h8dHJhc2h8ZGVsZXRlfHJlbW92ZS9pLnRlc3QoYWNjZXNzaWJsZU5hbWUoYnV0dG9uKSkpID8/IG51bGw7XG59XG5cbmZ1bmN0aW9uIGlzVmlzaWJsZVBob3RvVGlsZShlbGVtZW50OiBIVE1MRWxlbWVudCk6IGJvb2xlYW4ge1xuICBjb25zdCByZWN0ID0gZWxlbWVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgaWYgKHJlY3Qud2lkdGggPCBWSVNJQkxFX1BIT1RPX01JTl9TSVpFIHx8IHJlY3QuaGVpZ2h0IDwgVklTSUJMRV9QSE9UT19NSU5fU0laRSkgcmV0dXJuIGZhbHNlO1xuICBpZiAocmVjdC5ib3R0b20gPCAwIHx8IHJlY3QudG9wID4gd2luZG93LmlubmVySGVpZ2h0KSByZXR1cm4gZmFsc2U7XG4gIGlmIChyZWN0LnJpZ2h0IDwgMCB8fCByZWN0LmxlZnQgPiB3aW5kb3cuaW5uZXJXaWR0aCkgcmV0dXJuIGZhbHNlO1xuICByZXR1cm4gZ2V0Q29tcHV0ZWRTdHlsZShlbGVtZW50KS52aXNpYmlsaXR5ICE9PSAnaGlkZGVuJztcbn1cblxuZnVuY3Rpb24gbW9udGhGcm9tTGFiZWwobGFiZWw6IHN0cmluZyk6IHN0cmluZyB8IG51bGwge1xuICBjb25zdCBkYXRlID0gRGF0ZS5wYXJzZShsYWJlbCk7XG4gIGlmICghTnVtYmVyLmlzTmFOKGRhdGUpKSByZXR1cm4gTU9OVEhfRk9STUFULmZvcm1hdChuZXcgRGF0ZShkYXRlKSk7XG5cbiAgY29uc3QgbWF0Y2ggPSBsYWJlbC5tYXRjaChcbiAgICAvXFxiKEphbnVhcnl8RmVicnVhcnl8TWFyY2h8QXByaWx8TWF5fEp1bmV8SnVseXxBdWd1c3R8U2VwdGVtYmVyfE9jdG9iZXJ8Tm92ZW1iZXJ8RGVjZW1iZXIpXFxzK1xcZHsxLDJ9LD9cXHMrXFxkezR9XFxiL2ksXG4gICk7XG4gIGlmICghbWF0Y2gpIHJldHVybiBudWxsO1xuXG4gIGNvbnN0IG1hdGNoZWREYXRlID0gRGF0ZS5wYXJzZShtYXRjaFswXSk7XG4gIHJldHVybiBOdW1iZXIuaXNOYU4obWF0Y2hlZERhdGUpID8gbnVsbCA6IE1PTlRIX0ZPUk1BVC5mb3JtYXQobmV3IERhdGUobWF0Y2hlZERhdGUpKTtcbn1cblxuZnVuY3Rpb24gbW9udGhGcm9tTmVhcmJ5SGVhZGluZyh0aWxlOiBIVE1MRWxlbWVudCk6IHN0cmluZyB8IG51bGwge1xuICBsZXQgY3Vyc29yOiBFbGVtZW50IHwgbnVsbCA9IHRpbGU7XG4gIGZvciAobGV0IGRlcHRoID0gMDsgY3Vyc29yICYmIGRlcHRoIDwgNjsgZGVwdGggKz0gMSkge1xuICAgIGNvbnN0IGhlYWRpbmcgPSBjdXJzb3IucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJ1tyb2xlPVwiaGVhZGluZ1wiXSwgaDEsIGgyLCBoMywgW2FyaWEtbGFiZWxdJyk7XG4gICAgY29uc3QgdGV4dCA9IG5vcm1hbGl6ZVRleHQoaGVhZGluZz8udGV4dENvbnRlbnQgPz8gaGVhZGluZz8uZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJykgPz8gJycpO1xuICAgIGNvbnN0IG1vbnRoID0gbW9udGhGcm9tTGFiZWwodGV4dCk7XG4gICAgaWYgKG1vbnRoKSByZXR1cm4gbW9udGg7XG4gICAgY3Vyc29yID0gY3Vyc29yLnBhcmVudEVsZW1lbnQ7XG4gIH1cbiAgcmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIG5lYXJlc3RUZXh0TGFiZWwodGlsZTogSFRNTEVsZW1lbnQpOiBzdHJpbmcgfCBudWxsIHtcbiAgY29uc3QgdGV4dHM6IHN0cmluZ1tdID0gW107XG4gIGxldCBjdXJzb3I6IEhUTUxFbGVtZW50IHwgbnVsbCA9IHRpbGU7XG4gIGZvciAobGV0IGRlcHRoID0gMDsgY3Vyc29yICYmIGRlcHRoIDwgNDsgZGVwdGggKz0gMSkge1xuICAgIGNvbnN0IHRleHQgPSBub3JtYWxpemVUZXh0KGN1cnNvci5pbm5lclRleHQpO1xuICAgIGlmICh0ZXh0ICYmIHRleHQubGVuZ3RoIDwgMTIwKSB0ZXh0cy5wdXNoKHRleHQpO1xuICAgIGN1cnNvciA9IGN1cnNvci5wYXJlbnRFbGVtZW50O1xuICB9XG4gIHJldHVybiB0ZXh0c1swXSA/PyBudWxsO1xufVxuXG5mdW5jdGlvbiBmbGFzaFRpbGUodGlsZTogSFRNTEVsZW1lbnQpIHtcbiAgY29uc3QgcHJldmlvdXNPdXRsaW5lID0gdGlsZS5zdHlsZS5vdXRsaW5lO1xuICBjb25zdCBwcmV2aW91c09mZnNldCA9IHRpbGUuc3R5bGUub3V0bGluZU9mZnNldDtcbiAgdGlsZS5zdHlsZS5vdXRsaW5lID0gJzRweCBzb2xpZCAjMGY3NjZlJztcbiAgdGlsZS5zdHlsZS5vdXRsaW5lT2Zmc2V0ID0gJzJweCc7XG4gIHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHtcbiAgICB0aWxlLnN0eWxlLm91dGxpbmUgPSBwcmV2aW91c091dGxpbmU7XG4gICAgdGlsZS5zdHlsZS5vdXRsaW5lT2Zmc2V0ID0gcHJldmlvdXNPZmZzZXQ7XG4gIH0sIDYwMCk7XG59XG5cbmZ1bmN0aW9uIGFjY2Vzc2libGVOYW1lKGVsZW1lbnQ6IEhUTUxFbGVtZW50KTogc3RyaW5nIHtcbiAgcmV0dXJuIG5vcm1hbGl6ZVRleHQoXG4gICAgW1xuICAgICAgZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKSxcbiAgICAgIGVsZW1lbnQuZ2V0QXR0cmlidXRlKCd0aXRsZScpLFxuICAgICAgZWxlbWVudC50ZXh0Q29udGVudCxcbiAgICAgIGVsZW1lbnQucXVlcnlTZWxlY3Rvcignc3ZnIHRpdGxlJyk/LnRleHRDb250ZW50LFxuICAgIF1cbiAgICAgIC5maWx0ZXIoQm9vbGVhbilcbiAgICAgIC5qb2luKCcgJyksXG4gICk7XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZVN0YXR1cyhtZXNzYWdlOiBzdHJpbmcpIHtcbiAgc3RhdHVzTGluZS50ZXh0Q29udGVudCA9IG1lc3NhZ2U7XG59XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZVRleHQodGV4dDogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG4gIHJldHVybiAodGV4dCA/PyAnJykucmVwbGFjZSgvXFxzKy9nLCAnICcpLnRyaW0oKTtcbn1cblxuZnVuY3Rpb24gZGVib3VuY2U8VCBleHRlbmRzICguLi5hcmdzOiBuZXZlcltdKSA9PiB2b2lkPihmbjogVCwgZGVsYXk6IG51bWJlcikge1xuICBsZXQgdGltZW91dDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuICByZXR1cm4gKC4uLmFyZ3M6IFBhcmFtZXRlcnM8VD4pID0+IHtcbiAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuICAgIHRpbWVvdXQgPSB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiBmbiguLi5hcmdzKSwgZGVsYXkpO1xuICB9O1xufVxuXG5mdW5jdGlvbiB3YWl0KG1zOiBudW1iZXIpIHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB3aW5kb3cuc2V0VGltZW91dChyZXNvbHZlLCBtcykpO1xufVxuXG5mdW5jdGlvbiBwbHVyYWwoY291bnQ6IG51bWJlcikge1xuICByZXR1cm4gY291bnQgPT09IDEgPyAnJyA6ICdzJztcbn1cblxuZnVuY3Rpb24gc3VtKG1hcDogTWFwPHN0cmluZywgbnVtYmVyPikge1xuICByZXR1cm4gQXJyYXkuZnJvbShtYXAudmFsdWVzKCkpLnJlZHVjZSgodG90YWwsIHZhbHVlKSA9PiB0b3RhbCArIHZhbHVlLCAwKTtcbn1cblxuZnVuY3Rpb24gZXNjYXBlSHRtbCh2YWx1ZTogc3RyaW5nKSB7XG4gIGNvbnN0IGVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgZWxlbWVudC50ZXh0Q29udGVudCA9IHZhbHVlO1xuICByZXR1cm4gZWxlbWVudC5pbm5lckhUTUw7XG59XG5cbmZ1bmN0aW9uIG11c3RGaW5kPFQgZXh0ZW5kcyBFbGVtZW50PihzZWxlY3Rvcjogc3RyaW5nKTogVCB7XG4gIGNvbnN0IGVsZW1lbnQgPSByb290LnNoYWRvd1Jvb3Q/LnF1ZXJ5U2VsZWN0b3I8VD4oc2VsZWN0b3IpO1xuICBpZiAoIWVsZW1lbnQpIHRocm93IG5ldyBFcnJvcihgTWlzc2luZyBQaG90b3MgU3BvbmdlIFVJIGVsZW1lbnQ6ICR7c2VsZWN0b3J9YCk7XG4gIHJldHVybiBlbGVtZW50O1xufVxuIiwiLy8jcmVnaW9uIHNyYy91dGlscy9pbnRlcm5hbC9sb2dnZXIudHNcbmZ1bmN0aW9uIHByaW50KG1ldGhvZCwgLi4uYXJncykge1xuXHRpZiAoaW1wb3J0Lm1ldGEuZW52Lk1PREUgPT09IFwicHJvZHVjdGlvblwiKSByZXR1cm47XG5cdGlmICh0eXBlb2YgYXJnc1swXSA9PT0gXCJzdHJpbmdcIikgbWV0aG9kKGBbd3h0XSAke2FyZ3Muc2hpZnQoKX1gLCAuLi5hcmdzKTtcblx0ZWxzZSBtZXRob2QoXCJbd3h0XVwiLCAuLi5hcmdzKTtcbn1cbi8qKiBXcmFwcGVyIGFyb3VuZCBgY29uc29sZWAgd2l0aCBhIFwiW3d4dF1cIiBwcmVmaXggKi9cbmNvbnN0IGxvZ2dlciA9IHtcblx0ZGVidWc6ICguLi5hcmdzKSA9PiBwcmludChjb25zb2xlLmRlYnVnLCAuLi5hcmdzKSxcblx0bG9nOiAoLi4uYXJncykgPT4gcHJpbnQoY29uc29sZS5sb2csIC4uLmFyZ3MpLFxuXHR3YXJuOiAoLi4uYXJncykgPT4gcHJpbnQoY29uc29sZS53YXJuLCAuLi5hcmdzKSxcblx0ZXJyb3I6ICguLi5hcmdzKSA9PiBwcmludChjb25zb2xlLmVycm9yLCAuLi5hcmdzKVxufTtcbi8vI2VuZHJlZ2lvblxuZXhwb3J0IHsgbG9nZ2VyIH07XG4iLCIvLyAjcmVnaW9uIHNuaXBwZXRcbmV4cG9ydCBjb25zdCBicm93c2VyID0gZ2xvYmFsVGhpcy5icm93c2VyPy5ydW50aW1lPy5pZFxuICA/IGdsb2JhbFRoaXMuYnJvd3NlclxuICA6IGdsb2JhbFRoaXMuY2hyb21lO1xuLy8gI2VuZHJlZ2lvbiBzbmlwcGV0XG4iLCJpbXBvcnQgeyBicm93c2VyIGFzIGJyb3dzZXIkMSB9IGZyb20gXCJAd3h0LWRldi9icm93c2VyXCI7XG4vLyNyZWdpb24gc3JjL2Jyb3dzZXIudHNcbi8qKlxuKiBDb250YWlucyB0aGUgYGJyb3dzZXJgIGV4cG9ydCB3aGljaCB5b3Ugc2hvdWxkIHVzZSB0byBhY2Nlc3MgdGhlIGV4dGVuc2lvblxuKiBBUElzIGluIHlvdXIgcHJvamVjdDpcbipcbiogYGBgdHNcbiogaW1wb3J0IHsgYnJvd3NlciB9IGZyb20gJ3d4dC9icm93c2VyJztcbipcbiogYnJvd3Nlci5ydW50aW1lLm9uSW5zdGFsbGVkLmFkZExpc3RlbmVyKCgpID0+IHtcbiogICAvLyAuLi5cbiogfSk7XG4qIGBgYFxuKlxuKiBAbW9kdWxlIHd4dC9icm93c2VyXG4qL1xuY29uc3QgYnJvd3NlciA9IGJyb3dzZXIkMTtcbi8vI2VuZHJlZ2lvblxuZXhwb3J0IHsgYnJvd3NlciB9O1xuIiwiaW1wb3J0IHsgYnJvd3NlciB9IGZyb20gXCJ3eHQvYnJvd3NlclwiO1xuLy8jcmVnaW9uIHNyYy91dGlscy9pbnRlcm5hbC9jdXN0b20tZXZlbnRzLnRzXG52YXIgV3h0TG9jYXRpb25DaGFuZ2VFdmVudCA9IGNsYXNzIFd4dExvY2F0aW9uQ2hhbmdlRXZlbnQgZXh0ZW5kcyBFdmVudCB7XG5cdHN0YXRpYyBFVkVOVF9OQU1FID0gZ2V0VW5pcXVlRXZlbnROYW1lKFwid3h0OmxvY2F0aW9uY2hhbmdlXCIpO1xuXHRjb25zdHJ1Y3RvcihuZXdVcmwsIG9sZFVybCkge1xuXHRcdHN1cGVyKFd4dExvY2F0aW9uQ2hhbmdlRXZlbnQuRVZFTlRfTkFNRSwge30pO1xuXHRcdHRoaXMubmV3VXJsID0gbmV3VXJsO1xuXHRcdHRoaXMub2xkVXJsID0gb2xkVXJsO1xuXHR9XG59O1xuLyoqXG4qIFJldHVybnMgYW4gZXZlbnQgbmFtZSB1bmlxdWUgdG8gdGhlIGV4dGVuc2lvbiBhbmQgY29udGVudCBzY3JpcHQgdGhhdCdzXG4qIHJ1bm5pbmcuXG4qL1xuZnVuY3Rpb24gZ2V0VW5pcXVlRXZlbnROYW1lKGV2ZW50TmFtZSkge1xuXHRyZXR1cm4gYCR7YnJvd3Nlcj8ucnVudGltZT8uaWR9OiR7aW1wb3J0Lm1ldGEuZW52LkVOVFJZUE9JTlR9OiR7ZXZlbnROYW1lfWA7XG59XG4vLyNlbmRyZWdpb25cbmV4cG9ydCB7IFd4dExvY2F0aW9uQ2hhbmdlRXZlbnQsIGdldFVuaXF1ZUV2ZW50TmFtZSB9O1xuIiwiaW1wb3J0IHsgV3h0TG9jYXRpb25DaGFuZ2VFdmVudCB9IGZyb20gXCIuL2N1c3RvbS1ldmVudHMubWpzXCI7XG4vLyNyZWdpb24gc3JjL3V0aWxzL2ludGVybmFsL2xvY2F0aW9uLXdhdGNoZXIudHNcbmNvbnN0IHN1cHBvcnRzTmF2aWdhdGlvbkFwaSA9IHR5cGVvZiBnbG9iYWxUaGlzLm5hdmlnYXRpb24/LmFkZEV2ZW50TGlzdGVuZXIgPT09IFwiZnVuY3Rpb25cIjtcbi8qKlxuKiBDcmVhdGUgYSB1dGlsIHRoYXQgd2F0Y2hlcyBmb3IgVVJMIGNoYW5nZXMsIGRpc3BhdGNoaW5nIHRoZSBjdXN0b20gZXZlbnQgd2hlblxuKiBkZXRlY3RlZC4gU3RvcHMgd2F0Y2hpbmcgd2hlbiBjb250ZW50IHNjcmlwdCBpcyBpbnZhbGlkYXRlZC4gVXNlcyBOYXZpZ2F0aW9uXG4qIEFQSSB3aGVuIGF2YWlsYWJsZSwgb3RoZXJ3aXNlIGZhbGxzIGJhY2sgdG8gcG9sbGluZy5cbiovXG5mdW5jdGlvbiBjcmVhdGVMb2NhdGlvbldhdGNoZXIoY3R4KSB7XG5cdGxldCBsYXN0VXJsO1xuXHRsZXQgd2F0Y2hpbmcgPSBmYWxzZTtcblx0cmV0dXJuIHsgcnVuKCkge1xuXHRcdGlmICh3YXRjaGluZykgcmV0dXJuO1xuXHRcdHdhdGNoaW5nID0gdHJ1ZTtcblx0XHRsYXN0VXJsID0gbmV3IFVSTChsb2NhdGlvbi5ocmVmKTtcblx0XHRpZiAoc3VwcG9ydHNOYXZpZ2F0aW9uQXBpKSBnbG9iYWxUaGlzLm5hdmlnYXRpb24uYWRkRXZlbnRMaXN0ZW5lcihcIm5hdmlnYXRlXCIsIChldmVudCkgPT4ge1xuXHRcdFx0Y29uc3QgbmV3VXJsID0gbmV3IFVSTChldmVudC5kZXN0aW5hdGlvbi51cmwpO1xuXHRcdFx0aWYgKG5ld1VybC5ocmVmID09PSBsYXN0VXJsLmhyZWYpIHJldHVybjtcblx0XHRcdHdpbmRvdy5kaXNwYXRjaEV2ZW50KG5ldyBXeHRMb2NhdGlvbkNoYW5nZUV2ZW50KG5ld1VybCwgbGFzdFVybCkpO1xuXHRcdFx0bGFzdFVybCA9IG5ld1VybDtcblx0XHR9LCB7IHNpZ25hbDogY3R4LnNpZ25hbCB9KTtcblx0XHRlbHNlIGN0eC5zZXRJbnRlcnZhbCgoKSA9PiB7XG5cdFx0XHRjb25zdCBuZXdVcmwgPSBuZXcgVVJMKGxvY2F0aW9uLmhyZWYpO1xuXHRcdFx0aWYgKG5ld1VybC5ocmVmICE9PSBsYXN0VXJsLmhyZWYpIHtcblx0XHRcdFx0d2luZG93LmRpc3BhdGNoRXZlbnQobmV3IFd4dExvY2F0aW9uQ2hhbmdlRXZlbnQobmV3VXJsLCBsYXN0VXJsKSk7XG5cdFx0XHRcdGxhc3RVcmwgPSBuZXdVcmw7XG5cdFx0XHR9XG5cdFx0fSwgMWUzKTtcblx0fSB9O1xufVxuLy8jZW5kcmVnaW9uXG5leHBvcnQgeyBjcmVhdGVMb2NhdGlvbldhdGNoZXIgfTtcbiIsImltcG9ydCB7IGxvZ2dlciB9IGZyb20gXCIuL2ludGVybmFsL2xvZ2dlci5tanNcIjtcbmltcG9ydCB7IGdldFVuaXF1ZUV2ZW50TmFtZSB9IGZyb20gXCIuL2ludGVybmFsL2N1c3RvbS1ldmVudHMubWpzXCI7XG5pbXBvcnQgeyBjcmVhdGVMb2NhdGlvbldhdGNoZXIgfSBmcm9tIFwiLi9pbnRlcm5hbC9sb2NhdGlvbi13YXRjaGVyLm1qc1wiO1xuaW1wb3J0IHsgYnJvd3NlciB9IGZyb20gXCJ3eHQvYnJvd3NlclwiO1xuLy8jcmVnaW9uIHNyYy91dGlscy9jb250ZW50LXNjcmlwdC1jb250ZXh0LnRzXG4vKipcbiogSW1wbGVtZW50c1xuKiBbYEFib3J0Q29udHJvbGxlcmBdKGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0FQSS9BYm9ydENvbnRyb2xsZXIpLlxuKiBVc2VkIHRvIGRldGVjdCBhbmQgc3RvcCBjb250ZW50IHNjcmlwdCBjb2RlIHdoZW4gdGhlIHNjcmlwdCBpcyBpbnZhbGlkYXRlZC5cbipcbiogSXQgYWxzbyBwcm92aWRlcyBzZXZlcmFsIHV0aWxpdGllcyBsaWtlIGBjdHguc2V0VGltZW91dGAgYW5kXG4qIGBjdHguc2V0SW50ZXJ2YWxgIHRoYXQgc2hvdWxkIGJlIHVzZWQgaW4gY29udGVudCBzY3JpcHRzIGluc3RlYWQgb2ZcbiogYHdpbmRvdy5zZXRUaW1lb3V0YCBvciBgd2luZG93LnNldEludGVydmFsYC5cbipcbiogVG8gY3JlYXRlIGNvbnRleHQgZm9yIHRlc3RpbmcsIHlvdSBjYW4gdXNlIHRoZSBjbGFzcydzIGNvbnN0cnVjdG9yOlxuKlxuKiBgYGB0c1xuKiBpbXBvcnQgeyBDb250ZW50U2NyaXB0Q29udGV4dCB9IGZyb20gJ3d4dC91dGlscy9jb250ZW50LXNjcmlwdHMtY29udGV4dCc7XG4qXG4qIHRlc3QoJ3N0b3JhZ2UgbGlzdGVuZXIgc2hvdWxkIGJlIHJlbW92ZWQgd2hlbiBjb250ZXh0IGlzIGludmFsaWRhdGVkJywgKCkgPT4ge1xuKiAgIGNvbnN0IGN0eCA9IG5ldyBDb250ZW50U2NyaXB0Q29udGV4dCgndGVzdCcpO1xuKiAgIGNvbnN0IGl0ZW0gPSBzdG9yYWdlLmRlZmluZUl0ZW0oJ2xvY2FsOmNvdW50JywgeyBkZWZhdWx0VmFsdWU6IDAgfSk7XG4qICAgY29uc3Qgd2F0Y2hlciA9IHZpLmZuKCk7XG4qXG4qICAgY29uc3QgdW53YXRjaCA9IGl0ZW0ud2F0Y2god2F0Y2hlcik7XG4qICAgY3R4Lm9uSW52YWxpZGF0ZWQodW53YXRjaCk7IC8vIExpc3RlbiBmb3IgaW52YWxpZGF0ZSBoZXJlXG4qXG4qICAgYXdhaXQgaXRlbS5zZXRWYWx1ZSgxKTtcbiogICBleHBlY3Qod2F0Y2hlcikudG9CZUNhbGxlZFRpbWVzKDEpO1xuKiAgIGV4cGVjdCh3YXRjaGVyKS50b0JlQ2FsbGVkV2l0aCgxLCAwKTtcbipcbiogICBjdHgubm90aWZ5SW52YWxpZGF0ZWQoKTsgLy8gVXNlIHRoaXMgZnVuY3Rpb24gdG8gaW52YWxpZGF0ZSB0aGUgY29udGV4dFxuKiAgIGF3YWl0IGl0ZW0uc2V0VmFsdWUoMik7XG4qICAgZXhwZWN0KHdhdGNoZXIpLnRvQmVDYWxsZWRUaW1lcygxKTtcbiogfSk7XG4qIGBgYFxuKi9cbnZhciBDb250ZW50U2NyaXB0Q29udGV4dCA9IGNsYXNzIENvbnRlbnRTY3JpcHRDb250ZXh0IHtcblx0c3RhdGljIFNDUklQVF9TVEFSVEVEX01FU1NBR0VfVFlQRSA9IGdldFVuaXF1ZUV2ZW50TmFtZShcInd4dDpjb250ZW50LXNjcmlwdC1zdGFydGVkXCIpO1xuXHRpZDtcblx0YWJvcnRDb250cm9sbGVyO1xuXHRsb2NhdGlvbldhdGNoZXIgPSBjcmVhdGVMb2NhdGlvbldhdGNoZXIodGhpcyk7XG5cdGNvbnN0cnVjdG9yKGNvbnRlbnRTY3JpcHROYW1lLCBvcHRpb25zKSB7XG5cdFx0dGhpcy5jb250ZW50U2NyaXB0TmFtZSA9IGNvbnRlbnRTY3JpcHROYW1lO1xuXHRcdHRoaXMub3B0aW9ucyA9IG9wdGlvbnM7XG5cdFx0dGhpcy5pZCA9IE1hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnNsaWNlKDIpO1xuXHRcdHRoaXMuYWJvcnRDb250cm9sbGVyID0gbmV3IEFib3J0Q29udHJvbGxlcigpO1xuXHRcdHRoaXMuc3RvcE9sZFNjcmlwdHMoKTtcblx0XHR0aGlzLmxpc3RlbkZvck5ld2VyU2NyaXB0cygpO1xuXHR9XG5cdGdldCBzaWduYWwoKSB7XG5cdFx0cmV0dXJuIHRoaXMuYWJvcnRDb250cm9sbGVyLnNpZ25hbDtcblx0fVxuXHRhYm9ydChyZWFzb24pIHtcblx0XHRyZXR1cm4gdGhpcy5hYm9ydENvbnRyb2xsZXIuYWJvcnQocmVhc29uKTtcblx0fVxuXHRnZXQgaXNJbnZhbGlkKCkge1xuXHRcdGlmIChicm93c2VyLnJ1bnRpbWU/LmlkID09IG51bGwpIHRoaXMubm90aWZ5SW52YWxpZGF0ZWQoKTtcblx0XHRyZXR1cm4gdGhpcy5zaWduYWwuYWJvcnRlZDtcblx0fVxuXHRnZXQgaXNWYWxpZCgpIHtcblx0XHRyZXR1cm4gIXRoaXMuaXNJbnZhbGlkO1xuXHR9XG5cdC8qKlxuXHQqIEFkZCBhIGxpc3RlbmVyIHRoYXQgaXMgY2FsbGVkIHdoZW4gdGhlIGNvbnRlbnQgc2NyaXB0J3MgY29udGV4dCBpc1xuXHQqIGludmFsaWRhdGVkLlxuXHQqXG5cdCogQGV4YW1wbGVcblx0KiAgIGJyb3dzZXIucnVudGltZS5vbk1lc3NhZ2UuYWRkTGlzdGVuZXIoY2IpO1xuXHQqICAgY29uc3QgcmVtb3ZlSW52YWxpZGF0ZWRMaXN0ZW5lciA9IGN0eC5vbkludmFsaWRhdGVkKCgpID0+IHtcblx0KiAgICAgYnJvd3Nlci5ydW50aW1lLm9uTWVzc2FnZS5yZW1vdmVMaXN0ZW5lcihjYik7XG5cdCogICB9KTtcblx0KiAgIC8vIC4uLlxuXHQqICAgcmVtb3ZlSW52YWxpZGF0ZWRMaXN0ZW5lcigpO1xuXHQqXG5cdCogQHJldHVybnMgQSBmdW5jdGlvbiB0byByZW1vdmUgdGhlIGxpc3RlbmVyLlxuXHQqL1xuXHRvbkludmFsaWRhdGVkKGNiKSB7XG5cdFx0dGhpcy5zaWduYWwuYWRkRXZlbnRMaXN0ZW5lcihcImFib3J0XCIsIGNiKTtcblx0XHRyZXR1cm4gKCkgPT4gdGhpcy5zaWduYWwucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImFib3J0XCIsIGNiKTtcblx0fVxuXHQvKipcblx0KiBSZXR1cm4gYSBwcm9taXNlIHRoYXQgbmV2ZXIgcmVzb2x2ZXMuIFVzZWZ1bCBpZiB5b3UgaGF2ZSBhbiBhc3luYyBmdW5jdGlvblxuXHQqIHRoYXQgc2hvdWxkbid0IHJ1biBhZnRlciB0aGUgY29udGV4dCBpcyBleHBpcmVkLlxuXHQqXG5cdCogQGV4YW1wbGVcblx0KiAgIGNvbnN0IGdldFZhbHVlRnJvbVN0b3JhZ2UgPSBhc3luYyAoKSA9PiB7XG5cdCogICAgIGlmIChjdHguaXNJbnZhbGlkKSByZXR1cm4gY3R4LmJsb2NrKCk7XG5cdCpcblx0KiAgICAgLy8gLi4uXG5cdCogICB9O1xuXHQqL1xuXHRibG9jaygpIHtcblx0XHRyZXR1cm4gbmV3IFByb21pc2UoKCkgPT4ge30pO1xuXHR9XG5cdC8qKlxuXHQqIFdyYXBwZXIgYXJvdW5kIGB3aW5kb3cuc2V0SW50ZXJ2YWxgIHRoYXQgYXV0b21hdGljYWxseSBjbGVhcnMgdGhlIGludGVydmFsXG5cdCogd2hlbiBpbnZhbGlkYXRlZC5cblx0KlxuXHQqIEludGVydmFscyBjYW4gYmUgY2xlYXJlZCBieSBjYWxsaW5nIHRoZSBub3JtYWwgYGNsZWFySW50ZXJ2YWxgIGZ1bmN0aW9uLlxuXHQqL1xuXHRzZXRJbnRlcnZhbChoYW5kbGVyLCB0aW1lb3V0KSB7XG5cdFx0Y29uc3QgaWQgPSBzZXRJbnRlcnZhbCgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5pc1ZhbGlkKSBoYW5kbGVyKCk7XG5cdFx0fSwgdGltZW91dCk7XG5cdFx0dGhpcy5vbkludmFsaWRhdGVkKCgpID0+IGNsZWFySW50ZXJ2YWwoaWQpKTtcblx0XHRyZXR1cm4gaWQ7XG5cdH1cblx0LyoqXG5cdCogV3JhcHBlciBhcm91bmQgYHdpbmRvdy5zZXRUaW1lb3V0YCB0aGF0IGF1dG9tYXRpY2FsbHkgY2xlYXJzIHRoZSBpbnRlcnZhbFxuXHQqIHdoZW4gaW52YWxpZGF0ZWQuXG5cdCpcblx0KiBUaW1lb3V0cyBjYW4gYmUgY2xlYXJlZCBieSBjYWxsaW5nIHRoZSBub3JtYWwgYHNldFRpbWVvdXRgIGZ1bmN0aW9uLlxuXHQqL1xuXHRzZXRUaW1lb3V0KGhhbmRsZXIsIHRpbWVvdXQpIHtcblx0XHRjb25zdCBpZCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuaXNWYWxpZCkgaGFuZGxlcigpO1xuXHRcdH0sIHRpbWVvdXQpO1xuXHRcdHRoaXMub25JbnZhbGlkYXRlZCgoKSA9PiBjbGVhclRpbWVvdXQoaWQpKTtcblx0XHRyZXR1cm4gaWQ7XG5cdH1cblx0LyoqXG5cdCogV3JhcHBlciBhcm91bmQgYHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWVgIHRoYXQgYXV0b21hdGljYWxseSBjYW5jZWxzXG5cdCogdGhlIHJlcXVlc3Qgd2hlbiBpbnZhbGlkYXRlZC5cblx0KlxuXHQqIENhbGxiYWNrcyBjYW4gYmUgY2FuY2VsZWQgYnkgY2FsbGluZyB0aGUgbm9ybWFsIGBjYW5jZWxBbmltYXRpb25GcmFtZWBcblx0KiBmdW5jdGlvbi5cblx0Ki9cblx0cmVxdWVzdEFuaW1hdGlvbkZyYW1lKGNhbGxiYWNrKSB7XG5cdFx0Y29uc3QgaWQgPSByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKC4uLmFyZ3MpID0+IHtcblx0XHRcdGlmICh0aGlzLmlzVmFsaWQpIGNhbGxiYWNrKC4uLmFyZ3MpO1xuXHRcdH0pO1xuXHRcdHRoaXMub25JbnZhbGlkYXRlZCgoKSA9PiBjYW5jZWxBbmltYXRpb25GcmFtZShpZCkpO1xuXHRcdHJldHVybiBpZDtcblx0fVxuXHQvKipcblx0KiBXcmFwcGVyIGFyb3VuZCBgd2luZG93LnJlcXVlc3RJZGxlQ2FsbGJhY2tgIHRoYXQgYXV0b21hdGljYWxseSBjYW5jZWxzIHRoZVxuXHQqIHJlcXVlc3Qgd2hlbiBpbnZhbGlkYXRlZC5cblx0KlxuXHQqIENhbGxiYWNrcyBjYW4gYmUgY2FuY2VsZWQgYnkgY2FsbGluZyB0aGUgbm9ybWFsIGBjYW5jZWxJZGxlQ2FsbGJhY2tgXG5cdCogZnVuY3Rpb24uXG5cdCovXG5cdHJlcXVlc3RJZGxlQ2FsbGJhY2soY2FsbGJhY2ssIG9wdGlvbnMpIHtcblx0XHRjb25zdCBpZCA9IHJlcXVlc3RJZGxlQ2FsbGJhY2soKC4uLmFyZ3MpID0+IHtcblx0XHRcdGlmICghdGhpcy5zaWduYWwuYWJvcnRlZCkgY2FsbGJhY2soLi4uYXJncyk7XG5cdFx0fSwgb3B0aW9ucyk7XG5cdFx0dGhpcy5vbkludmFsaWRhdGVkKCgpID0+IGNhbmNlbElkbGVDYWxsYmFjayhpZCkpO1xuXHRcdHJldHVybiBpZDtcblx0fVxuXHRhZGRFdmVudExpc3RlbmVyKHRhcmdldCwgdHlwZSwgaGFuZGxlciwgb3B0aW9ucykge1xuXHRcdGlmICh0eXBlID09PSBcInd4dDpsb2NhdGlvbmNoYW5nZVwiKSB7XG5cdFx0XHRpZiAodGhpcy5pc1ZhbGlkKSB0aGlzLmxvY2F0aW9uV2F0Y2hlci5ydW4oKTtcblx0XHR9XG5cdFx0dGFyZ2V0LmFkZEV2ZW50TGlzdGVuZXI/Lih0eXBlLnN0YXJ0c1dpdGgoXCJ3eHQ6XCIpID8gZ2V0VW5pcXVlRXZlbnROYW1lKHR5cGUpIDogdHlwZSwgaGFuZGxlciwge1xuXHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdHNpZ25hbDogdGhpcy5zaWduYWxcblx0XHR9KTtcblx0fVxuXHQvKipcblx0KiBAaW50ZXJuYWxcblx0KiBBYm9ydCB0aGUgYWJvcnQgY29udHJvbGxlciBhbmQgZXhlY3V0ZSBhbGwgYG9uSW52YWxpZGF0ZWRgIGxpc3RlbmVycy5cblx0Ki9cblx0bm90aWZ5SW52YWxpZGF0ZWQoKSB7XG5cdFx0dGhpcy5hYm9ydChcIkNvbnRlbnQgc2NyaXB0IGNvbnRleHQgaW52YWxpZGF0ZWRcIik7XG5cdFx0bG9nZ2VyLmRlYnVnKGBDb250ZW50IHNjcmlwdCBcIiR7dGhpcy5jb250ZW50U2NyaXB0TmFtZX1cIiBjb250ZXh0IGludmFsaWRhdGVkYCk7XG5cdH1cblx0c3RvcE9sZFNjcmlwdHMoKSB7XG5cdFx0ZG9jdW1lbnQuZGlzcGF0Y2hFdmVudChuZXcgQ3VzdG9tRXZlbnQoQ29udGVudFNjcmlwdENvbnRleHQuU0NSSVBUX1NUQVJURURfTUVTU0FHRV9UWVBFLCB7IGRldGFpbDoge1xuXHRcdFx0Y29udGVudFNjcmlwdE5hbWU6IHRoaXMuY29udGVudFNjcmlwdE5hbWUsXG5cdFx0XHRtZXNzYWdlSWQ6IHRoaXMuaWRcblx0XHR9IH0pKTtcblx0XHRpZiAoIXRoaXMub3B0aW9ucz8ubm9TY3JpcHRTdGFydGVkUG9zdE1lc3NhZ2UpIHdpbmRvdy5wb3N0TWVzc2FnZSh7XG5cdFx0XHR0eXBlOiBDb250ZW50U2NyaXB0Q29udGV4dC5TQ1JJUFRfU1RBUlRFRF9NRVNTQUdFX1RZUEUsXG5cdFx0XHRjb250ZW50U2NyaXB0TmFtZTogdGhpcy5jb250ZW50U2NyaXB0TmFtZSxcblx0XHRcdG1lc3NhZ2VJZDogdGhpcy5pZFxuXHRcdH0sIFwiKlwiKTtcblx0fVxuXHR2ZXJpZnlTY3JpcHRTdGFydGVkRXZlbnQoZXZlbnQpIHtcblx0XHRjb25zdCBpc1NhbWVDb250ZW50U2NyaXB0ID0gZXZlbnQuZGV0YWlsPy5jb250ZW50U2NyaXB0TmFtZSA9PT0gdGhpcy5jb250ZW50U2NyaXB0TmFtZTtcblx0XHRjb25zdCBpc0Zyb21TZWxmID0gZXZlbnQuZGV0YWlsPy5tZXNzYWdlSWQgPT09IHRoaXMuaWQ7XG5cdFx0cmV0dXJuIGlzU2FtZUNvbnRlbnRTY3JpcHQgJiYgIWlzRnJvbVNlbGY7XG5cdH1cblx0bGlzdGVuRm9yTmV3ZXJTY3JpcHRzKCkge1xuXHRcdGNvbnN0IGNiID0gKGV2ZW50KSA9PiB7XG5cdFx0XHRpZiAoIShldmVudCBpbnN0YW5jZW9mIEN1c3RvbUV2ZW50KSB8fCAhdGhpcy52ZXJpZnlTY3JpcHRTdGFydGVkRXZlbnQoZXZlbnQpKSByZXR1cm47XG5cdFx0XHR0aGlzLm5vdGlmeUludmFsaWRhdGVkKCk7XG5cdFx0fTtcblx0XHRkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKENvbnRlbnRTY3JpcHRDb250ZXh0LlNDUklQVF9TVEFSVEVEX01FU1NBR0VfVFlQRSwgY2IpO1xuXHRcdHRoaXMub25JbnZhbGlkYXRlZCgoKSA9PiBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKENvbnRlbnRTY3JpcHRDb250ZXh0LlNDUklQVF9TVEFSVEVEX01FU1NBR0VfVFlQRSwgY2IpKTtcblx0fVxufTtcbi8vI2VuZHJlZ2lvblxuZXhwb3J0IHsgQ29udGVudFNjcmlwdENvbnRleHQgfTtcbiJdLCJ4X2dvb2dsZV9pZ25vcmVMaXN0IjpbMCwyLDMsNCw1LDYsN10sIm1hcHBpbmdzIjoiOztDQUNBLFNBQVMsb0JBQW9CLFlBQVk7RUFDeEMsT0FBTztDQUNSOzs7Q0NpQkEsSUFBQSxVQUFBO0NBQ0EsSUFBQSx5QkFBQTtDQUNBLElBQUEsZUFBQSxJQUFBLEtBQUEsZUFBQSxLQUFBLEdBQUE7OztDQUdBLENBQUE7Q0FFQSxJQUFBLFFBQUE7Ozs7Ozs7OztDQVNBO0NBRUEsSUFBQTtDQUNBLElBQUE7Q0FDQSxJQUFBO0NBQ0EsSUFBQTtDQUNBLElBQUE7Q0FFQSxJQUFBLHlCQUFBLG9CQUFBOzs7Ozs7Ozs7Ozs7O0NBYUEsQ0FBQTtDQUVBLFNBQUEsVUFBQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Q0F3T0E7Q0FFQSxTQUFBLGNBQUEsT0FBQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztDQTJCQTtDQUVBLFNBQUEsYUFBQTs7Ozs7Ozs7Ozs7Ozs7OztDQW1CQTtDQUVBLFNBQUEsY0FBQSxVQUFBOzs7Ozs7Ozs7Ozs7O0NBa0JBO0NBRUEsU0FBQSxlQUFBOzs7Ozs7Ozs7Q0FZQTtDQUVBLGVBQUEsb0JBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztDQXdDQTtDQUVBLFNBQUEsZ0JBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7O0NBMEJBO0NBRUEsU0FBQSxZQUFBLE1BQUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Q0FzQkE7Q0FFQSxTQUFBLG9CQUFBLGNBQUEsT0FBQTs7Ozs7Ozs7Ozs7Ozs7Ozs7OztDQTRCQTtDQUVBLFNBQUEsZ0JBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztDQTRCQTtDQUVBLFNBQUEsZ0JBQUE7Ozs7Ozs7Ozs7Ozs7O0NBZUE7Q0FFQSxTQUFBLGFBQUEsU0FBQTs7Ozs7Ozs7Ozs7Ozs7Q0FlQTtDQUVBLGVBQUEsWUFBQSxNQUFBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7O0NBa0JBO0NBRUEsU0FBQSxjQUFBLE1BQUE7O0NBRUE7Q0FFQSxTQUFBLGtCQUFBLE1BQUE7Ozs7Ozs7Q0FXQTtDQUVBLFNBQUEsa0JBQUE7O0NBR0E7Q0FFQSxTQUFBLDBCQUFBOzs7Q0FLQTtDQUVBLFNBQUEsbUJBQUEsU0FBQTs7Ozs7O0NBTUE7Q0FFQSxTQUFBLGVBQUEsT0FBQTs7Ozs7OztDQVdBO0NBRUEsU0FBQSx1QkFBQSxNQUFBOzs7Ozs7Ozs7Q0FVQTtDQUVBLFNBQUEs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