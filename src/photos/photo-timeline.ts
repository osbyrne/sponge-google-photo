import { delay, hasPendingPhotoMetadata, readPhotos, timelineScroller, waitFor } from "./google-photos";
import type { PhotoItem } from "./types";

/** Reads overlapping sections of Google's grid without retaining recycled DOM nodes. */
export class PhotoTimeline {
  private readonly seen = new Set<string>();
  private pending: PhotoItem[] = [];
  private frontier = 0;
  private before = Infinity;

  async begin(before: number, signal: AbortSignal): Promise<PhotoItem | null> {
    this.seen.clear();
    this.pending = [];
    this.before = before;
    const root = timelineScroller();
    root.scrollTop = 0;
    await this.rendered(signal);
    if (Number.isFinite(before)) await this.seek(before, signal);
    this.frontier = root.scrollTop;
    this.collect();
    return this.next(signal);
  }

  async next(signal: AbortSignal): Promise<PhotoItem | null> {
    if (this.pending.length) return this.take();
    const root = timelineScroller();
    root.scrollTop = this.frontier;
    await this.rendered(signal);
    this.collect();
    if (this.pending.length) return this.take();

    for (let step = 0; step < 30; step += 1) {
      const previous = root.scrollTop;
      root.scrollTop = Math.min(root.scrollHeight - root.clientHeight, previous + root.clientHeight * 0.6);
      await delay(120, signal);
      await this.rendered(signal);
      this.frontier = root.scrollTop;
      this.collect();
      if (this.pending.length) return this.take();
      if (root.scrollTop + root.clientHeight >= root.scrollHeight - 2) {
        const height = root.scrollHeight;
        await delay(1000, signal);
        this.collect();
        if (this.pending.length) return this.take();
        if (root.scrollHeight === height && !this.loading(root) && readPhotos(root, true).length) return null;
      }
      if (root.scrollTop === previous && !this.loading(root)) break;
    }
    throw new Error("Older photos have not loaded yet. Your decisions are saved for this session; reopen the panel with the extension icon to retry.");
  }

  rebase(): void {
    this.pending = [];
    this.frontier = timelineScroller().scrollTop;
  }

  private take(): PhotoItem | null {
    const photo = this.pending.shift() ?? null;
    if (photo) this.seen.add(photo.id);
    return photo;
  }

  private collect(): void {
    const queued = new Set(this.pending.map((photo) => photo.id));
    for (const photo of readPhotos(timelineScroller(), true)) {
      if (this.seen.has(photo.id) || queued.has(photo.id)) continue;
      if (Number.isFinite(this.before)) {
        if (photo.takenAt === null) throw new Error("Could not read photo dates. Choose Now to review in timeline order.");
        if (photo.takenAt >= this.before) continue;
      }
      this.pending.push(photo);
      queued.add(photo.id);
    }
  }

  private async rendered(signal: AbortSignal): Promise<PhotoItem[]> {
    const photos = await waitFor(() => {
      const root = timelineScroller();
      if (hasPendingPhotoMetadata(root)) return undefined;
      const items = readPhotos(root, true);
      return items.length ? items : undefined;
    }, signal, 5000);
    if (!photos) throw new Error("Waiting for Google Photos to load the timeline. Reopen the panel with the extension icon when photos appear.");
    return photos;
  }

  private loading(root: HTMLElement): boolean {
    return Array.from(root.querySelectorAll<HTMLElement>('[role="progressbar"], [aria-busy="true"]'))
      .some((node) => node.checkVisibility());
  }

  private async seek(before: number, signal: AbortSignal): Promise<void> {
    const root = timelineScroller();
    const first = (await this.rendered(signal))[0];
    if (first?.takenAt === null) throw new Error("Could not read photo dates. Choose Now to review in timeline order.");
    if (first && first.takenAt !== null && first.takenAt < before) return;
    let low = 0;
    let high = root.scrollHeight - root.clientHeight;
    const dateAt = async (position: number) => {
      root.scrollTop = position;
      await delay(120, signal);
      const photo = (await this.rendered(signal))[0];
      if (!photo || photo.takenAt === null) throw new Error("Could not read photo dates. Choose Now to review in timeline order.");
      return photo.takenAt;
    };
    // Find a nearby bracket first, so recent months do not visit the oldest years.
    let distance = root.clientHeight * 0.6;
    for (let step = 0; low < high && step < 24; step += 1) {
      const position = Math.min(high, low + distance);
      if (await dateAt(position) < before) {
        high = position;
        break;
      }
      low = position;
      distance *= 2;
    }
    for (let step = 0; high - low > root.clientHeight * 0.35 && step < 24; step += 1) {
      const middle = Math.floor((low + high) / 2);
      if (await dateAt(middle) >= before) low = middle;
      else high = middle;
    }
    root.scrollTop = low;
    await delay(120, signal);
    await this.rendered(signal);
  }
}
