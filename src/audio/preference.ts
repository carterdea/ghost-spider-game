/** The slice of `Storage` the mute preference needs. */
export type MuteStorage = Pick<Storage, "getItem" | "setItem">;

const STORAGE_KEY = "ghost-spider:muted";

/**
 * `localStorage` is absent in tests and throws outright in Safari's private
 * mode, so every access here is guarded and failure just means "not muted".
 */
export const detectStorage = (): MuteStorage | undefined => {
  const scope = globalThis as { localStorage?: MuteStorage };
  try {
    return scope.localStorage;
  } catch {
    return undefined;
  }
};

export const readMuted = (storage: MuteStorage | undefined): boolean => {
  try {
    return storage?.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

export const writeMuted = (
  storage: MuteStorage | undefined,
  muted: boolean,
): void => {
  try {
    storage?.setItem(STORAGE_KEY, muted ? "1" : "0");
  } catch {
    return;
  }
};
