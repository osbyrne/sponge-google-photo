import { isPhotosTimeline, hasSelectedPhotos, loadPhotoPreview, setPhotoSelected, startOptions } from "./google-photos";
import { hasOpenPhotosDialog, moveSelectedPhotosToTrash } from "./google-photos-trash";
import { PhotoTimeline } from "./photo-timeline";
import type { PhotoItem, ReviewDecision, ReviewSnapshot } from "./types";

type Retry = { kind: "start" } | { kind: "next" } | { kind: "show"; photo: PhotoItem };
type RestingState = { phase: "idle" | "complete" } |
  { phase: "reviewing" | "paused"; current: PhotoItem } |
  { phase: "error"; retry: Retry };
type State = RestingState | { phase: "loading"; current: PhotoItem | null } |
  { phase: "confirming"; resume: RestingState };
type Decision = { photo: PhotoItem; decision: ReviewDecision };

export class ReviewController {
  private state: State = { phase: "idle" };
  private source = new PhotoTimeline();
  private history: Decision[] = [];
  private future: PhotoItem[] = [];
  private readonly starts = startOptions();
  private startFrom = "now";
  private paused = false;
  private reviewed = 0;
  private kept = 0;
  private status = "Opening the latest photo...";
  private readonly subscribers = new Set<(snapshot: ReviewSnapshot) => void>();

  constructor(private readonly signal: AbortSignal) {}

  get snapshot(): ReviewSnapshot {
    return {
      phase: this.state.phase,
      busy: this.state.phase === "loading" || this.state.phase === "confirming",
      starts: this.starts,
      startFrom: this.startFrom,
      current: this.current(),
      reviewedCount: this.reviewed,
      selectedCount: this.history.filter((item) => item.decision === "trash").length,
      keptCount: this.kept,
      canUndo: this.history.length > 0,
      status: this.status,
    };
  }

  subscribe(subscriber: (snapshot: ReviewSnapshot) => void): () => void {
    this.subscribers.add(subscriber);
    subscriber(this.snapshot);
    return () => this.subscribers.delete(subscriber);
  }

  async start(value = this.startFrom): Promise<void> {
    if (this.snapshot.busy) return;
    const start = this.starts.find((option) => option.value === value);
    if (!start) return;
    if (this.snapshot.selectedCount || hasSelectedPhotos()) {
      this.status = "Move the selected photos to trash or clear the selection before choosing a new starting point.";
      this.emit();
      return;
    }
    this.startFrom = value;
    this.history = [];
    this.future = [];
    this.reviewed = 0;
    this.kept = 0;
    this.paused = false;
    this.source = new PhotoTimeline();
    this.status = value === "now" ? "Opening the latest photo..." : `Finding ${start.label}...`;
    await this.perform({ kind: "start" }, async () => {
      if (!isPhotosTimeline()) throw new Error("Open the Photos tab in Google Photos to begin reviewing.");
      await this.present(await this.source.begin(start.before, this.signal));
    });
  }

  setVisible(visible: boolean): void {
    if (!visible) this.pause();
    else if (!this.snapshot.busy) void this.resume();
    else this.paused = false;
  }

  pause(): void {
    this.paused = true;
    if (this.state.phase === "reviewing") this.state = { phase: "paused", current: this.state.current };
    if (!this.snapshot.busy) this.status = "Reopen the panel with the extension icon to continue. Your place and marked photos are preserved.";
    this.emit();
  }

  async resume(): Promise<void> {
    if (this.snapshot.busy || this.state.phase === "reviewing") return;
    this.paused = false;
    if (this.state.phase === "idle" || (this.state.phase === "error" && this.state.retry.kind === "start")) {
      await this.start();
    } else if (this.state.phase === "paused") {
      const photo = this.state.current;
      await this.perform({ kind: "show", photo }, () => this.present(photo));
    } else if (this.state.phase === "error") {
      const retry = this.state.retry;
      if (retry.kind === "show") await this.perform(retry, () => this.present(retry.photo));
      else await this.loadNext();
    }
  }

  async decide(decision: ReviewDecision): Promise<void> {
    if (this.state.phase !== "reviewing") return;
    const photo = this.state.current;
    const recorded = await this.perform({ kind: "show", photo }, async () => {
      if (decision === "trash" && !(await setPhotoSelected(photo, true, this.signal))) {
        throw new Error("Google Photos did not select this photo. Reopen the panel with the extension icon, then press N to try again.");
      }
      this.history.push({ photo, decision });
      this.reviewed += 1;
      if (decision === "keep") this.kept += 1;
    });
    if (recorded) await this.loadNext();
  }

  async undo(): Promise<void> {
    if (this.snapshot.busy) return;
    const last = this.history.at(-1);
    if (!last) return;
    const current = this.current();
    await this.perform(current ? { kind: "show", photo: current } : { kind: "next" }, async () => {
      if (last.decision === "trash" && !(await setPhotoSelected(last.photo, false, this.signal))) {
        throw new Error("Google Photos did not unselect this photo. Your decisions are preserved; try Undo again.");
      }
      this.history.pop();
      if (current) this.future.unshift(current);
      this.reviewed -= 1;
      if (last.decision === "keep") this.kept -= 1;
      await this.present(last.photo);
    });
  }

  private async loadNext(): Promise<void> {
    this.status = "Loading the next older photo...";
    this.state = { phase: "loading", current: this.current() };
    this.emit();
    let photo: PhotoItem | null = null;
    try {
      if (!isPhotosTimeline()) throw new Error("Return to the Photos tab, then reopen the panel with the extension icon. Your review is preserved.");
      photo = this.future[0] ?? await this.source.next(this.signal);
      await this.present(photo);
    } catch (error) {
      if (!this.signal.aborted) {
        this.state = { phase: "error", retry: photo ? { kind: "show", photo } : { kind: "next" } };
        this.status = error instanceof Error ? error.message : "Could not load the next photo. Reopen the panel with the extension icon to retry.";
      }
    } finally {
      if (!this.signal.aborted) this.emit();
    }
  }

  private async present(photo: PhotoItem | null): Promise<void> {
    if (!photo) {
      this.state = { phase: "complete" };
      this.status = "End of the timeline. You can move the marked photos to trash or undo your last choice.";
      return;
    }
    const current = await loadPhotoPreview(photo, this.signal);
    if (this.future[0]?.id === photo.id) this.future.shift();
    this.state = { phase: this.paused ? "paused" : "reviewing", current };
    this.status = this.paused ? "Reopen the panel with the extension icon to continue. Your place and marked photos are preserved." : "Y to keep, N to mark for trash. Keep going as far back as you like.";
    const next = this.future[0];
    if (next?.thumbUrl) {
      const image = new Image();
      image.src = next.thumbUrl;
    }
  }

  private async perform(retry: Retry, action: () => Promise<void>): Promise<boolean> {
    this.state = { phase: "loading", current: this.current() };
    this.emit();
    try {
      if (!isPhotosTimeline()) throw new Error("Return to the Photos tab, then reopen the panel with the extension icon. Your review is preserved.");
      await action();
      return true;
    } catch (error) {
      if (!this.signal.aborted) {
        this.state = { phase: "error", retry };
        this.status = error instanceof Error ? error.message : "Google Photos could not complete this action. Reopen the panel with the extension icon to retry.";
      }
      return false;
    } finally {
      if (!this.signal.aborted) this.emit();
    }
  }

  private async moveToTrash(): Promise<void> {
    if (this.state.phase === "loading" || this.state.phase === "confirming" || !this.snapshot.selectedCount) return;
    const resume = this.state;
    this.state = { phase: "confirming", resume };
    this.status = "Confirm the move to trash in Google Photos, or cancel to keep reviewing.";
    this.emit();
    const result = await moveSelectedPhotosToTrash(this.signal);
    if (this.signal.aborted) return;
    this.state = resume;
    switch (result) {
      case "moved":
        this.history = [];
        this.source.rebase();
        this.status = "Selection moved to trash. Continue with the next photo.";
        break;
      case "cancelled":
        this.status = "Move to trash cancelled. Your place and marked photos are preserved.";
        break;
      case "unavailable":
        this.status = "Could not find the trash action. Use the Google Photos toolbar to move the selection to trash.";
        break;
      case "unverified":
        this.status = "Could not verify the move to trash. Check Google Photos before continuing.";
        break;
      default: {
        const exhaustive: never = result;
        return exhaustive;
      }
    }
    if (this.paused && this.state.phase === "reviewing") this.state = { phase: "paused", current: this.state.current };
    this.emit();
  }

  handleKeydown(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();
    if (key === "enter" && event.repeat && this.state.phase === "confirming") {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (this.state.phase === "confirming" || hasOpenPhotosDialog() || event.defaultPrevented ||
      event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey ||
      event.composedPath().some((target) => target instanceof HTMLElement && (target.isContentEditable ||
        target.matches('input, textarea, select, button, a[href], [role="textbox"], [role="button"]') ||
        (target instanceof HTMLVideoElement && key !== "y" && key !== "n" && key !== "u")))) return;
    if (!this.snapshot.busy && key === "enter" && this.snapshot.selectedCount > 0) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void this.moveToTrash();
    } else if (!this.snapshot.busy && key === "u" && this.history.length) {
      event.preventDefault();
      void this.undo();
    } else if (this.state.phase === "reviewing" && (key === "y" || key === "n")) {
      event.preventDefault();
      void this.decide(key === "y" ? "keep" : "trash");
    }
  }

  private current(state: State = this.state): PhotoItem | null {
    switch (state.phase) {
      case "reviewing": case "paused": case "loading": return state.current;
      case "confirming": return this.current(state.resume);
      case "error": return state.retry.kind === "show" ? state.retry.photo : null;
      case "idle": case "complete": return null;
      default: {
        const exhaustive: never = state;
        return exhaustive;
      }
    }
  }

  private emit(): void {
    for (const subscriber of this.subscribers) subscriber(this.snapshot);
  }
}
