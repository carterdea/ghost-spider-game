/** `12:04`, and never a bare `4` for four seconds. */
export const formatDuration = (milliseconds: number): string => {
  const total = Math.max(0, Math.round(milliseconds / 1000));
  const seconds = total % 60;
  return `${Math.floor(total / 60)}:${String(seconds).padStart(2, "0")}`;
};

/** A chain of one is not a chain, and reads better as a dash than as a 1. */
export const chainLabel = (best: number): string =>
  best > 1 ? `${best}×` : "—";
