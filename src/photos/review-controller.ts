import {
  clearPhotoSelection,
  collectVisiblePhotos,
  focusPhoto,
  hasOpenPhotosDialog,
  hasSelectedPhotos,
  listVisibleMonths,
  moveSelectedPhotosToTrash,
  setPhotoSelected,
} from "./google-photos";
import type {
  PhotoItem,
  ReviewDecision,
  ReviewPhase,
  ReviewSnapshot,
} from "./types";

type Subscriber = (snapshot: ReviewSnapshot) => void;

export class ReviewController {
  private phase: ReviewPhase = "idle";
  private busy = false;
  private months = listVisibleMonths();
  private selectedMonth = this.months[0]?.label ?? "";
  private queue: PhotoItem[] = [];
  private index = 0;
  private selected: PhotoItem[] = [];
  private kept: PhotoItem[] = [];
  private status = "Visible photos are grouped by their Google Photos labels.";
  private readonly subscribers = new Set<Subscriber>();

  constructor(private readonly signal: AbortSignal) {}

  get snapshot(): ReviewSnapshot {
    const current = this.queue[this.index];
    return {
      phase: this.phase,
      busy: this.busy,
      months: this.months,
      selectedMonth: this.selectedMonth,
      current: this.phase === "reviewing" && current
        ? {
          label: current.label,
          thumbUrl: current.thumbUrl,
          position: this.index + 1,
          total: this.queue.length,
        }
        : undefined,
      selectedCount: this.selected.length,
      keptCount: this.kept.length,
      status: this.status,
    };
  }

  subscribe(subscriber: Subscriber): () => void {
    this.subscribers.add(subscriber);
    subscriber(this.snapshot);
    return () => this.subscribers.delete(subscriber);
  }

  setMonth(month: string): void {
    if (this.phase !== "idle") return;
    this.selectedMonth = month;
    this.emit();
  }

  refresh(showMessage = false): void {
    if (this.phase !== "idle") return;

    const previous = this.selectedMonth;
    this.months = listVisibleMonths();
    this.selectedMonth = this.months.some((month) => month.label === previous)
      ? previous
      : (this.months[0]?.label ?? "");

    if (showMessage) {
      const count = this.months.reduce(
        (total, month) => total + month.count,
        0,
      );
      this.status = `Refreshed. Found ${count} visible photo${plural(count)}.`;
    }
    this.emit();
  }

  start(): void {
    if (this.busy || this.phase !== "idle") return;
    if (hasSelectedPhotos()) {
      this.status =
        "Clear the current Google Photos selection before starting a review.";
      this.emit();
      return;
    }

    this.queue = collectVisiblePhotos().filter((photo) =>
      photo.month === this.selectedMonth
    );
    this.index = 0;
    this.selected = [];
    this.kept = [];

    if (this.queue.length === 0) {
      this.status =
        "No visible photos found for that month. Scroll the grid and refresh.";
      this.emit();
      return;
    }

    this.phase = "reviewing";
    this.updateReviewStatus();
    this.emitAndFocus();
  }

  async decide(decision: ReviewDecision): Promise<void> {
    if (this.phase !== "reviewing" || this.busy) return;
    const current = this.queue[this.index];
    if (!current) return;

    this.busy = true;
    this.emit();

    if (decision === "trash") {
      this.status = `Selecting ${current.label} in Google Photos...`;
      this.emit();
      if (!(await setPhotoSelected(current, true))) {
        this.busy = false;
        this.status =
          "Google Photos did not select this photo. Scroll it into view and press N again.";
        this.emit();
        return;
      }
      this.selected.push(current);
    } else {
      this.kept.push(current);
    }

    this.index += 1;
    this.busy = false;

    if (this.index >= this.queue.length) {
      this.phase = "complete";
      this.status = this.selected.length > 0
        ? `${this.kept.length} kept. Press Enter to move the selection to trash, or U to undo.`
        : `${this.kept.length} kept. Nothing is selected. Press U to review the last photo again.`;
      this.emit();
      return;
    }

    this.updateReviewStatus();
    this.emitAndFocus();
  }

  async undo(): Promise<void> {
    if (this.phase === "idle" || this.busy) return;
    this.busy = true;
    this.emit();

    if (this.phase === "complete") {
      this.phase = "reviewing";
      this.index = Math.max(0, this.queue.length - 1);
    } else if (this.index > 0) {
      this.index -= 1;
    }

    const current = this.queue[this.index];
    if (current && this.selected.some((photo) => photo.id === current.id)) {
      await setPhotoSelected(current, false);
    }
    this.selected = this.selected.filter((photo) => photo.id !== current?.id);
    this.kept = this.kept.filter((photo) => photo.id !== current?.id);
    this.busy = false;
    this.updateReviewStatus();
    this.emitAndFocus();
  }

  async stop(): Promise<void> {
    if (this.phase === "idle" || this.busy) return;
    this.busy = true;
    this.emit();
    await clearPhotoSelection(this.selected);

    this.resetReview("Stopped. No photos were moved to trash.");
    this.emit();
  }

  private async moveToTrash(): Promise<void> {
    if (this.phase !== "complete" || this.busy || this.selected.length === 0) return;
    const count = this.selected.length;
    this.phase = "confirming";
    this.busy = true;
    this.status = "Confirm the move to trash in Google Photos, or cancel to keep reviewing.";
    this.emit();

    const result = await moveSelectedPhotosToTrash(this.signal);
    if (this.signal.aborted) return;
    this.busy = false;
    this.phase = "complete";
    switch (result) {
      case "moved":
        this.resetReview(`${count} photo${plural(count)} moved to trash.`);
        break;
      case "cancelled":
        this.status = "Move to trash cancelled. Press Enter to try again, or U to undo.";
        break;
      case "unavailable":
        this.status = "Could not find the trash action. Use the Google Photos toolbar to move the selection to trash.";
        break;
      case "unverified":
        this.status = "Could not verify the move to trash. Check Google Photos before continuing.";
        break;
    }
    this.emit();
  }

  private resetReview(status: string): void {
    this.phase = "idle";
    this.busy = false;
    this.queue = [];
    this.index = 0;
    this.selected = [];
    this.kept = [];
    this.months = listVisibleMonths();
    this.selectedMonth =
      this.months.some((month) => month.label === this.selectedMonth)
        ? this.selectedMonth
        : (this.months[0]?.label ?? "");
    this.status = status;
  }

  handleKeydown(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();
    if (key === "enter" && event.repeat && this.phase === "confirming") {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (
      this.phase === "idle" || this.phase === "confirming" || this.busy ||
      hasOpenPhotosDialog() || event.defaultPrevented || event.repeat || event.isComposing ||
      event.ctrlKey || event.metaKey || event.altKey || event.shiftKey ||
      event.composedPath().some((target) =>
        target instanceof HTMLElement && (target.isContentEditable ||
          target.matches('input, textarea, select, button, a[href], [role="textbox"], [role="button"]'))
      )
    ) {
      return;
    }

    if (key === "enter" && this.phase === "complete" && this.selected.length > 0) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void this.moveToTrash();
    } else if (key === "y") {
      event.preventDefault();
      void this.decide("keep");
    } else if (key === "n") {
      event.preventDefault();
      void this.decide("trash");
    } else if (key === "u") {
      event.preventDefault();
      void this.undo();
    } else if (key === "escape") {
      event.preventDefault();
      void this.stop();
    }
  }

  private updateReviewStatus(): void {
    this.status =
      `${this.selectedMonth}: ${this.index + 1}/${this.queue.length}. ` +
      `${this.selected.length} marked for trash, ${this.kept.length} kept.`;
  }

  private emitAndFocus(): void {
    this.emit();
    const current = this.queue[this.index];
    if (current) focusPhoto(current);
  }

  private emit(): void {
    const snapshot = this.snapshot;
    for (const subscriber of this.subscribers) subscriber(snapshot);
  }
}

function plural(count: number): string {
  return count === 1 ? "" : "s";
}
