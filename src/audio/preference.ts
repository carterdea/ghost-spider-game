import type { KeyValueStorage } from "../storage";

export type MuteStorage = KeyValueStorage;

const STORAGE_KEY = "ghost-spider:muted";

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
