export type PhotoItem = {
  id: string;
  label: string;
  thumbUrl?: string;
  takenAt: number | null;
  scrollTop: number;
} & ({ kind: "photo" } | { kind: "video"; videoUrl: string | null });

export type StartOption = {
  value: string;
  label: string;
  before: number;
};

export type ReviewPhase = "idle" | "loading" | "reviewing" | "paused" | "complete" | "error" | "confirming";

export type ReviewSnapshot = {
  phase: ReviewPhase;
  busy: boolean;
  starts: StartOption[];
  startFrom: string;
  current: PhotoItem | null;
  reviewedCount: number;
  selectedCount: number;
  keptCount: number;
  canUndo: boolean;
  status: string;
};

export type ReviewDecision = "keep" | "trash";
