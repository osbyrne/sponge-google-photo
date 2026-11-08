import { mount, tick, unmount } from "svelte";
import App from "../../entrypoints/photos.content/App.svelte";
import { readPhotos } from "../../src/photos/google-photos";
import { ReviewController } from "../../src/photos/review-controller";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function equal(actual: unknown, expected: unknown, message: string) {
  assert(actual === expected, `${message}: expected ${expected}, got ${actual}`);
}
const wait = (ms = 20) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
async function until(read: () => boolean, message: string) {
  const deadline = performance.now() + 10000;
  while (!read()) {
    assert(performance.now() < deadline, message);
    await wait();
  }
}

const thumbnail = "https://photos.fife.usercontent.google.com/pw/test=w200-h300-no?authuser=1";
const poster = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E';
const clip = new URL("./playback.webm", location.href).href;

function fixture() {
  document.body.innerHTML = '<div role="main" style="height:360px;width:500px;overflow:auto"></div>';
  const root = document.querySelector('[role="main"]');
  assert(root instanceof HTMLElement, "Missing timeline");
  for (let index = 0; index < 3; index += 1) {
    const tile = document.createElement("div");
    const link = document.createElement("a");
    link.href = `/photo/video-test-${index}`;
    link.ariaLabel = `${index < 2 ? "Video" : "Photo"} - Nov 7, 2026, 12:00:00 PM`;
    link.style.cssText = "display:block;width:120px;height:100px";
    link.style.backgroundImage = `url("${thumbnail}")`;
    const checkbox = document.createElement("button");
    checkbox.role = "checkbox";
    checkbox.ariaChecked = "false";
    checkbox.onclick = () => { checkbox.ariaChecked = String(checkbox.ariaChecked !== "true"); };
    tile.append(link, checkbox);
    root.append(tile);
  }
  const abort = new AbortController();
  const controller = new ReviewController(abort.signal);
  const target = document.createElement("div");
  document.body.append(target);
  window.addEventListener("keydown", (event) => controller.handleKeydown(event), { capture: true, signal: abort.signal });
  let app: ReturnType<typeof mount> | undefined;
  return {
    root, target, controller,
    async start(url = clip) {
      await controller.start();
      this.setVideoUrl(url);
      app = mount(App, { target, props: { controller } });
      await wait();
    },
    setVideoUrl(url: string) {
      const photo = controller.snapshot.current;
      assert(photo?.kind === "video", "Current fixture item should be a video");
      photo.videoUrl = url;
      photo.thumbUrl = poster;
    },
    async play() {
      const button = target.querySelector<HTMLButtonElement>(".play-video");
      assert(button && !button.disabled, "Play control should be available");
      button.click();
      await tick();
      const video = target.querySelector("video");
      assert(video instanceof HTMLVideoElement, "Player should be a native video element");
      return video;
    },
    press(key: string, control: EventTarget = document.body) {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, composed: true });
      control.dispatchEvent(event);
      return event;
    },
    async dispose() {
      abort.abort();
      if (app) await unmount(app);
      app = undefined;
    },
  };
}

type Fixture = ReturnType<typeof fixture>;
const cases: [string, (f: Fixture) => Promise<void>][] = [
  ["Video detection preserves account parameters and distinguishes photos and unsupported thumbnails", async (f) => {
    const items = readPhotos(f.root);
    const video = items[0];
    assert(video?.kind === "video", "English Video label should identify video");
    equal(video.videoUrl, "https://photos.fife.usercontent.google.com/pw/test=dv?authuser=1", "Playback should preserve the account");
    equal(items[2]?.kind, "photo", "Photos should remain still images");
    const link = f.root.querySelector("a");
    assert(link, "Missing video link");
    link.ariaLabel = "Vidéo - 7 novembre 2026";
    link.style.backgroundImage = 'url("https://lh3.googleusercontent.com/test=w100-h200")';
    const french = readPhotos(f.root)[0];
    assert(french?.kind === "video", "French Vidéo label should identify video");
    equal(french.videoUrl, "https://lh3.googleusercontent.com/test=dv", "Older Google thumbnail hosts should work");
    for (const url of ["https://example.invalid/video.jpg", "https://lh3.googleusercontent.com.example.invalid/test=w100", poster]) {
      link.style.backgroundImage = `url('${url}')`;
      const unsupported = readPhotos(f.root)[0];
      assert(unsupported?.kind === "video" && unsupported.videoUrl === null, "Unknown sources must not become playback URLs");
    }
  }],
  ["Video stays a thumbnail until clicked, then the real clip plays with native controls", async (f) => {
    await f.start();
    assert(f.target.querySelector("img"), "Poster should be visible before playing");
    equal(f.target.querySelector("video"), null, "No video should load before a click");
    assert(!performance.getEntriesByName(clip).length, "The clip should not be requested ahead of the click");
    const video = await f.play();
    await until(() => video.currentTime > 0 && !video.paused, "Video should decode and advance after clicking");
    assert(video.controls && video.playsInline, "Native playback controls should be available");
    equal(video.videoWidth, 64, "The real fixture must decode");
    assert(video.duration > 2, "The real clip should expose its duration");
    equal(f.controller.snapshot.reviewedCount, 0, "Playing must not record a review decision");
  }],
  ["Hiding the panel releases playback and reopening waits for another click", async (f) => {
    await f.start();
    const video = await f.play();
    await until(() => !video.paused, "Clip should start before hiding");
    f.controller.setVisible(false);
    await wait();
    assert(video.paused && !video.hasAttribute("src"), "Hiding should stop audio and release the media source");
    equal(f.target.querySelector("video"), null, "Hidden review must not keep a player");
    f.controller.setVisible(true);
    await wait();
    equal(f.target.querySelector("video"), null, "Reopening must not autoplay");
    assert(f.target.querySelector(".play-video"), "Reopening should offer Play again");
  }],
  ["Keep, Trash, and Undo stop the old video and reset the next preview", async (f) => {
    await f.start();
    let video = await f.play();
    f.press("Y");
    await until(() => f.controller.snapshot.current?.id === "/photo/video-test-1", "Y should advance while playing");
    assert(video.paused && !video.hasAttribute("src"), "Keep must release the old player");
    equal(f.target.querySelector("video"), null, "The next video must wait for a click");
    f.setVideoUrl(clip);
    video = await f.play();
    f.press("N");
    await until(() => f.controller.snapshot.current?.id === "/photo/video-test-2", "N should advance while playing");
    assert(video.paused && !video.hasAttribute("src"), "Trash must release the old player");
    equal(f.controller.snapshot.selectedCount, 1, "Trash should retain its selection behavior");
    assert(!f.target.querySelector(".play-video"), "A photo must not show Play");
    f.press("U");
    await until(() => f.controller.snapshot.current?.id === "/photo/video-test-1", "Undo should restore the video");
    equal(f.target.querySelector("video"), null, "Undo must not restart playback");
    equal(f.controller.snapshot.selectedCount, 0, "Undo should unselect the restored video");
  }],
  ["Player controls retain Enter and Space instead of triggering review actions", async (f) => {
    await f.start();
    await f.controller.decide("trash");
    f.setVideoUrl(clip);
    await wait();
    const video = await f.play();
    assert(!f.press("Enter", video).defaultPrevented, "Enter on video must belong to the native player");
    assert(!f.press(" ", video).defaultPrevented, "Space must belong to the native player");
    equal(f.controller.snapshot.phase, "reviewing", "Player controls must not open trash");
    equal(f.controller.snapshot.selectedCount, 1, "Player controls must preserve pending selections");
    assert(f.press("Y", video).defaultPrevented, "Y should keep working with the player focused");
    await until(() => f.controller.snapshot.current?.id === "/photo/video-test-2", "Focused player must allow Keep");
    equal(f.controller.snapshot.selectedCount, 1, "Keep must preserve earlier pending selections");
  }],
  ["Playback failure restores the poster and permits retry without changing the review", async (f) => {
    await f.start(new URL("./missing-video.webm", location.href).href);
    await f.play();
    await until(() => f.target.textContent?.includes("Could not play") === true, "Failed media should show recovery");
    assert(f.target.querySelector("img"), "The poster should survive playback failure");
    equal(f.target.querySelector("video"), null, "Failed media should be released");
    equal(f.controller.snapshot.phase, "reviewing", "Video failure must not stop review");
    equal(f.controller.snapshot.reviewedCount, 0, "Video failure must not decide the item");
    f.setVideoUrl(clip);
    const retried = await f.play();
    await until(() => !retried.paused && retried.readyState >= 2, "Retry should play the corrected media");
  }],
  ["Pause during loading cancels playback, and unmount releases the player", async (f) => {
    await f.start();
    const video = await f.play();
    f.controller.pause();
    await wait();
    assert(video.paused && !video.hasAttribute("src"), "Pause must cancel pending playback");
    await f.controller.resume();
    await wait();
    const next = await f.play();
    await f.dispose();
    assert(next.paused && !next.hasAttribute("src"), "Unmount must release video and audio");
  }],
];

async function run() {
  const results: { name: string; error?: string }[] = [];
  for (const [name, test] of cases) {
    const f = fixture();
    try {
      await test(f);
      results.push({ name });
    } catch (error) {
      results.push({ name, error: String(error) });
    } finally {
      await f.dispose();
    }
  }
  const output = document.createElement("pre");
  output.dataset.testResults = btoa(JSON.stringify(results));
  document.body.append(output);
}

void run();
