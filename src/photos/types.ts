export type PhotoItem = {
  id: string;
  tile: HTMLElement;
  image?: HTMLImageElement;
  label: string;
  month: string;
  thumbUrl?: string;
};

export type MonthOption = {
  label: string;
  count: number;
};

export type ReviewPhase = "idle" | "reviewing" | "complete" | "confirming";

export type ReviewSnapshot = {
  phase: ReviewPhase;
  busy: boolean;
  months: MonthOption[];
  selectedMonth: string;
  current?: {
    label: string;
    thumbUrl?: string;
    position: number;
    total: number;
  };
  selectedCount: number;
  keptCount: number;
  status: string;
};

export type ReviewDecision = "keep" | "trash";
