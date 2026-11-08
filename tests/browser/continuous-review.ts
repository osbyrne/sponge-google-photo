import { ReviewController } from "../../src/photos/review-controller";
import { photoDate, readPhotos } from "../../src/photos/google-photos";
import { mount, unmount } from "svelte";
import App from "../../entrypoints/photos.content/App.svelte";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function equal(actual: unknown, expected: unknown, message: string) {
  assert(actual === expected, `${message}: expected ${expected}, got ${actual}`);
}
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

function fixture(count = 36, metadataDelay = 0) {
  document.body.innerHTML = '<div id="toolbar"></div><div role="main" style="height:360px;width:500px;overflow:auto;position:relative"><div id="canvas" style="position:relative"></div></div>';
  const root = document.querySelector('[role="main"]');
  const canvas = document.querySelector('#canvas');
  const toolbar = document.querySelector('#toolbar');
  assert(root instanceof HTMLElement && canvas instanceof HTMLElement && toolbar instanceof HTMLElement, "Missing fixture");
  const photos = Array.from({ length: count }, (_, index) => ({
    id: `/photo/id-${index}`,
    date: new Date(2026, 10, 7 - index),
  }));
  const selected = new Set<string>();
  const abort = new AbortController();
  let blocked = false;
  let generation = 0;
  let renderedAt = -1;
  let nativeConfirmations = 0;
  let dialog: HTMLElement | null = null;

  const render = () => {
    renderedAt = root.scrollTop;
    const version = ++generation;
    canvas.style.height = `${photos.length * 120}px`;
    canvas.replaceChildren();
    toolbar.replaceChildren();
    if (selected.size) {
      const clear = document.createElement("button");
      clear.setAttribute("aria-label", "Clear selection");
      const trash = document.createElement("button");
      trash.setAttribute("aria-label", "Move to trash");
      trash.textContent = "Move to trash";
      trash.onclick = () => {
        dialog = document.createElement("div");
        dialog.role = "dialog";
        const cancel = document.createElement("button");
        cancel.textContent = "Cancel";
        cancel.onclick = () => dialog?.remove();
        const confirm = document.createElement("button");
        confirm.textContent = "Move to trash";
        confirm.onclick = () => {
          nativeConfirmations += 1;
          for (let index = photos.length - 1; index >= 0; index -= 1) {
            const photo = photos[index];
            if (photo && selected.has(photo.id)) photos.splice(index, 1);
          }
          selected.clear();
          dialog?.remove();
          render();
        };
        dialog.append(cancel, confirm);
        document.body.append(dialog);
      };
      toolbar.append(clear, trash);
    }
    const first = Math.max(0, Math.floor(root.scrollTop / 120) - 1);
    const last = Math.min(photos.length, Math.ceil((root.scrollTop + 360) / 120) + 2);
    for (let index = first; index < last; index += 1) {
      const photo = photos[index];
      if (!photo) continue;
      const tile = document.createElement("div");
      tile.style.cssText = `position:absolute;top:${index * 120}px;width:120px;height:110px`;
      const link = document.createElement("a");
      link.href = photo.id;
      link.style.cssText = "display:block;width:110px;height:100px";
      tile.append(link);
      canvas.append(tile);
      const populate = () => {
        if (version !== generation || blocked) return;
        const label = `Photo - Portrait - ${photo.date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}, 12:00:00 PM`;
        link.setAttribute("aria-label", label);
        link.style.backgroundImage = 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\'/%3E")';
        const checkbox = document.createElement("button");
        checkbox.role = "checkbox";
        checkbox.setAttribute("aria-label", label);
        checkbox.setAttribute("aria-checked", String(selected.has(photo.id)));
        checkbox.onclick = () => {
          if (selected.has(photo.id)) selected.delete(photo.id);
          else selected.add(photo.id);
          render();
        };
        tile.append(checkbox);
      };
      if (metadataDelay) window.setTimeout(populate, index % 2 ? metadataDelay : 0);
      else populate();
    }
  };
  root.addEventListener("scroll", render, { signal: abort.signal });
  // Chrome's virtual clock can advance timers before delivering compositor scroll events.
  const renderer = window.setInterval(() => {
    if (renderedAt !== root.scrollTop) render();
  }, 40);
  abort.signal.addEventListener("abort", () => window.clearInterval(renderer), { once: true });
  render();
  const controller = new ReviewController(abort.signal);
  window.addEventListener("keydown", (event) => controller.handleKeydown(event), { capture: true, signal: abort.signal });
  return {
    controller, root, selected, photos, abort,
    block() { blocked = true; },
    unblock() { blocked = false; render(); },
    get nativeConfirmations() { return nativeConfirmations; },
    press(key: string) {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    },
    confirm() {
      const control = dialog?.querySelectorAll("button")[1];
      assert(control, "Native confirmation should be open");
      control.click();
    },
  };
}

type Fixture = ReturnType<typeof fixture>;
const cases: [string, (f: Fixture) => Promise<void>, number?][] = [
  ["Opening begins with the newest photo, and reopening resumes the same place", async (f) => {
    f.root.scrollTop = 1200;
    await wait(100);
    f.controller.setVisible(true);
    await wait(100);
    equal(f.controller.snapshot.current?.id, "/photo/id-0", "Opening should show latest photo");
    await f.controller.decide("keep");
    const current = f.controller.snapshot.current?.id;
    f.controller.setVisible(false);
    equal(f.controller.snapshot.phase, "paused", "Hiding should pause review");
    f.controller.setVisible(true);
    await wait(100);
    equal(f.controller.snapshot.current?.id, current, "Reopening should preserve position");
  }],
  ["Opening waits for the latest photo's thumbnail instead of keeping an empty preview", async (f) => {
    const latest = f.root.querySelector<HTMLAnchorElement>('a[href="/photo/id-0"]');
    assert(latest, "Latest photo should be present");
    const thumbnail = latest.style.backgroundImage;
    latest.style.backgroundImage = "";
    const target = document.createElement("div");
    document.body.append(target);
    const app = mount(App, { target, props: { controller: f.controller } });
    const loading = f.controller.start();
    window.setTimeout(() => { latest.style.backgroundImage = thumbnail; }, 250);
    try {
      await loading;
      await wait(300);
      equal(f.controller.snapshot.current?.id, "/photo/id-0", "Startup must keep the latest photo");
      assert(f.controller.snapshot.current?.thumbUrl, "Late thumbnail must populate the current item");
      assert(target.querySelector(".media-preview img"), "The latest photo must appear automatically");
      assert(!target.textContent?.includes("Preview unavailable"), "Delayed thumbnails must not leave a permanent empty preview");
      equal(f.selected.size, 0, "Opening must not mark the photo for trash");
    } finally {
      await unmount(app);
    }
  }],
  ["A buffered video refreshes its thumbnail and playback source before presentation", async (f) => {
    const link = f.root.querySelector<HTMLAnchorElement>('a[href="/photo/id-1"]');
    assert(link, "Second item should be present");
    link.ariaLabel = "Video - Nov 6, 2026, 12:00:00 PM";
    link.style.backgroundImage = "";
    await f.controller.start();
    link.style.backgroundImage = 'url("https://lh3.googleusercontent.com/late-video=w100-h200?authuser=1")';
    await f.controller.decide("keep");
    const current = f.controller.snapshot.current;
    equal(current?.id, "/photo/id-1", "The next item must retain timeline order");
    assert(current?.kind === "video", "The next item should be a video");
    assert(current.thumbUrl, "Buffered items must refresh late thumbnails");
    equal(current.videoUrl, "https://lh3.googleusercontent.com/late-video=dv?authuser=1", "The refreshed video must support click-to-play");
  }],
  ["A missing latest preview remains retryable without skipping the photo", async (f) => {
    const latest = f.root.querySelector<HTMLAnchorElement>('a[href="/photo/id-0"]');
    assert(latest, "Latest photo should be present");
    const thumbnail = latest.style.backgroundImage;
    latest.style.backgroundImage = "";
    await f.controller.start();
    equal(f.controller.snapshot.phase, "error", "Missing preview should not enter review with an empty image");
    equal(f.controller.snapshot.reviewedCount, 0, "Missing preview must not skip the latest photo");
    assert(f.controller.snapshot.status.includes("preview"), "The loading issue should be explained");
    latest.style.backgroundImage = thumbnail;
    f.controller.setVisible(false);
    f.controller.setVisible(true);
    await wait(200);
    equal(f.controller.snapshot.current?.id, "/photo/id-0", "Retry must still start at the latest photo");
    assert(f.controller.snapshot.current?.thumbUrl, "Retry should show the restored preview");
  }],
  ["Review crosses months and recycled pages without repeats or missing selections", async (f) => {
    await f.controller.start();
    for (let index = 0; index < 24; index += 1) {
      equal(f.controller.snapshot.current?.id, `/photo/id-${index}`, "Chronological sequence must have no gaps");
      await f.controller.decide(index % 2 ? "keep" : "trash");
    }
    equal(f.selected.size, 12, "Selections must persist after tiles are recycled");
    equal(f.controller.snapshot.current?.id, "/photo/id-24", "Review must continue across month boundaries");
    equal(f.controller.snapshot.selectedCount, 12, "Marked count must match Google Photos selection");
    assert(f.root.scrollTop > 360, "The real scroll container must advance");
  }],
  ["Undo finds an older recycled tile by its stable photo link", async (f) => {
    await f.controller.start();
    await f.controller.decide("trash");
    for (let index = 0; index < 12; index += 1) await f.controller.decide("keep");
    for (let index = 0; index < 13; index += 1) await f.controller.undo();
    equal(f.controller.snapshot.current?.id, "/photo/id-0", "Undo should return to first photo");
    equal(f.selected.size, 0, "Undo should unselect the exact older photo");
    await f.controller.decide("keep");
    equal(f.controller.snapshot.current?.id, "/photo/id-1", "Forward review after undo should retain order");
  }],
  ["Enter can commit selections mid-review and continue with the next undecided photo", async (f) => {
    await f.controller.start();
    await f.controller.decide("trash");
    await f.controller.decide("keep");
    const current = f.controller.snapshot.current?.id;
    f.press("Enter");
    equal(f.controller.snapshot.phase, "confirming", "Enter should work during continuous review");
    equal(f.nativeConfirmations, 0, "The extension must leave confirmation to the user");
    f.confirm();
    await wait(100);
    equal(f.controller.snapshot.current?.id, current, "Commit must preserve the next undecided photo");
    equal(f.controller.snapshot.selectedCount, 0, "Commit should clear pending selections");
    equal(f.controller.snapshot.canUndo, false, "Undo must stop at the committed trash operation");
    for (let index = 2; index < 10; index += 1) {
      equal(f.controller.snapshot.current?.id, `/photo/id-${index}`, "Deletion must not skip buffered photos");
      await f.controller.decide("keep");
    }
  }],
  ["Month is a starting point, and review continues into earlier months", async (f) => {
    await f.controller.start("2026-10");
    equal(f.controller.snapshot.current?.id, "/photo/id-7", "October should begin at its newest photo");
    for (let index = 7; index < 34; index += 1) {
      equal(f.controller.snapshot.current?.id, `/photo/id-${index}`, "Month start should retain chronological order");
      await f.controller.decide("keep");
    }
    equal(f.controller.snapshot.current?.id, "/photo/id-34", "September should follow October automatically");
  }],
  ["Lazy tile shells wait for metadata instead of entering the review", async (f) => {
    await f.controller.start();
    for (let index = 0; index < 8; index += 1) {
      equal(f.controller.snapshot.current?.id, `/photo/id-${index}`, "Delayed metadata should not cause skips");
      assert(f.controller.snapshot.current?.takenAt !== null, "Loaded photo should have its date");
      await f.controller.decide("keep");
    }
  }, 250],
  ["A loading failure preserves decisions and resumes at the next photo", async (f) => {
    await f.controller.start();
    f.block();
    for (let index = 0; index < 8 && f.controller.snapshot.phase !== "error"; index += 1) {
      await f.controller.decide("keep");
    }
    equal(f.controller.snapshot.phase, "error", "Missing content must be a recoverable error, not the end");
    const count = f.controller.snapshot.reviewedCount;
    f.unblock();
    f.controller.setVisible(false);
    f.controller.setVisible(true);
    await wait(1000);
    equal(f.controller.snapshot.current?.id, `/photo/id-${count}`, "Retry must not repeat a decision");
    equal(f.controller.snapshot.reviewedCount, count, "Retry must preserve counts");
  }],
  ["A new starting point cannot take over pending selections", async (f) => {
    await f.controller.start();
    await f.controller.decide("trash");
    const id = f.controller.snapshot.current?.id;
    await f.controller.start("2026-10");
    equal(f.controller.snapshot.current?.id, id, "Changing dates must preserve pending review");
    equal(f.selected.size, 1, "Changing dates must preserve native selection");
  }],
  ["Pre-existing selections outside the rendered grid are left alone", async (f) => {
    f.selected.add("/photo/id-35");
    f.unblock();
    await f.controller.start();
    equal(f.controller.snapshot.current, null, "A session must not take over an existing selection");
    equal(f.selected.size, 1, "The existing selection must remain untouched");
    assert(f.controller.snapshot.status.includes("selection"), "The panel should explain how to begin");
  }],
  ["An empty starting month begins at the next older photo", async (f) => {
    for (let index = 7; index < f.photos.length; index += 1) {
      const photo = f.photos[index];
      if (photo) photo.date = new Date(2026, 8, 30 - index);
    }
    f.unblock();
    await f.controller.start("2026-10");
    equal(f.controller.snapshot.current?.id, "/photo/id-7", "A month without photos must continue to an earlier month");
  }],
  ["End of the timeline is reported after the final loaded photo", async (f) => {
    await f.controller.start();
    for (let index = 0; index < f.photos.length; index += 1) await f.controller.decide("keep");
    equal(f.controller.snapshot.phase, "complete", "True end should complete review");
    equal(f.controller.snapshot.reviewedCount, f.photos.length, "Every photo must be reviewed once");
  }],
  ["Photo IDs survive thumbnail changes, and English/French dates parse", async (f) => {
    const before = readPhotos()[0]?.id;
    const link = f.root.querySelector<HTMLAnchorElement>("a");
    assert(link, "Missing tile");
    link.style.backgroundImage = 'url("https://example.invalid/different-thumbnail-size")';
    equal(readPhotos()[0]?.id, before, "Thumbnail changes must not change identity");
    assert(photoDate("Photo - Portrait - Nov 7, 2026, 7:50:57 AM") !== null, "English date should parse");
    equal(new Date(photoDate("Photo - 7 novembre 2026") ?? 0).getMonth(), 10, "French date should parse");
    assert(photoDate("Video - Oct 31, 2026, 7:50:57 AM - 0:12") !== null, "Video duration must not hide the date");
  }],
  ["The panel opens fullscreen and preserves date navigation and native trash confirmation", async (f) => {
    const target = document.createElement("div");
    document.body.append(target);
    const app = mount(App, { target, props: { controller: f.controller } });
    try {
      await f.controller.start();
      await wait(20);
      const select = target.querySelector("select");
      assert(select instanceof HTMLSelectElement, "Start from dropdown should be rendered");
      equal(select.value, "now", "Now should be the default starting point");
      const panel = target.querySelector(".panel");
      assert(panel instanceof HTMLElement, "Review panel should be rendered");
      equal(target.querySelectorAll("select").length, 1, "Only the starting date selector should be rendered");
      const bounds = panel.getBoundingClientRect();
      equal(bounds.x, 0, "Fullscreen should start at the viewport's left edge");
      equal(bounds.y, 0, "Fullscreen should start at the viewport's top edge");
      equal(bounds.width, window.innerWidth, "Fullscreen should fill the viewport width");
      equal(bounds.height, window.innerHeight, "Fullscreen should fill the viewport height");
      assert(!target.textContent?.includes("Photos Sponge"), "The panel must not display the app title");
      assert(!Array.from(target.querySelectorAll("button")).some((button) => /^(Pause|Resume|Restart)$/.test(button.textContent?.trim() ?? "")), "The panel must not display pause/resume controls");
      assert(!Array.from(target.querySelectorAll("kbd")).some((key) => key.textContent === "Esc"), "The panel must not offer Escape to pause");
      f.press("Escape");
      equal(f.controller.snapshot.phase, "reviewing", "Escape must not pause the review");
      f.controller.setVisible(false);
      await wait(20);
      equal(f.controller.snapshot.phase, "paused", "Hiding with the icon should pause review");
      f.controller.setVisible(true);
      await wait(20);
      equal(f.controller.snapshot.phase, "reviewing", "Reopening with the icon should resume review");
      select.value = "2026-10";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      await wait(2000);
      equal(f.controller.snapshot.current?.id, "/photo/id-7", "Dropdown should start October review");
      f.press("Y");
      await wait(200);
      equal(f.controller.snapshot.current?.id, "/photo/id-8", "Shortcuts should work immediately after date selection");
      f.press("N");
      await wait(200);
      const current = f.controller.snapshot.current?.id;
      f.press("Enter");
      await wait(20);
      assert(!panel.checkVisibility(), "Panel must hide while Google's trash confirmation is open");
      equal(f.nativeConfirmations, 0, "Hiding the panel must leave confirmation to the user");
      const cancel = document.querySelector('[role="dialog"] button');
      assert(cancel instanceof HTMLButtonElement, "Google's cancel button should be available");
      cancel.click();
      await wait(20);
      assert(panel.checkVisibility(), "Panel must return after cancellation");
      equal(f.controller.snapshot.current?.id, current, "Cancellation must preserve the current photo");
      equal(f.controller.snapshot.selectedCount, 1, "Cancellation must preserve the marked photo");
      f.press("Enter");
      await wait(20);
      assert(!panel.checkVisibility(), "Panel must hide again when retrying trash");
      f.confirm();
      await wait(20);
      assert(panel.checkVisibility(), "Panel must return after confirmation");
      equal(f.controller.snapshot.current?.id, current, "Confirmation must preserve the next photo");
      equal(f.controller.snapshot.selectedCount, 0, "Confirmation must clear committed selections");
    } finally {
      await unmount(app);
    }
  }],
];

async function run() {
  const results: { name: string; error?: string }[] = [];
  for (const [name, test, delay] of cases) {
    const f = fixture(36, delay);
    try {
      await test(f);
      results.push({ name });
    } catch (error) {
      results.push({ name, error: `${String(error)}; ${JSON.stringify({
        phase: f.controller.snapshot.phase, status: f.controller.snapshot.status,
        scrollTop: f.root.scrollTop, height: f.root.scrollHeight,
        rendered: readPhotos(f.root, true).map((photo) => photo.id),
        bounds: f.root.getBoundingClientRect().toJSON(),
        tiles: Array.from(f.root.querySelectorAll("a")).map((a) => ({
          id: a.getAttribute("href"), label: a.getAttribute("aria-label"), rect: a.getBoundingClientRect().toJSON(),
        })),
      })}` });
    } finally {
      f.abort.abort();
    }
  }
  const output = document.createElement("pre");
  output.dataset.testResults = btoa(JSON.stringify(results));
  document.body.append(output);
}

void run();
