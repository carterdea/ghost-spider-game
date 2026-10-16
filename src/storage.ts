/** The slice of `Storage` the game persists through. */
export type KeyValueStorage = Pick<Storage, "getItem" | "setItem">;

/**
 * `localStorage` is absent in tests and throws outright in Safari's private
 * mode, so every access is guarded and failure just means "nothing saved".
 */
export const detectStorage = (): KeyValueStorage | undefined => {
  const scope = globalThis as { localStorage?: KeyValueStorage };
  try {
    return scope.localStorage;
  } catch {
    return undefined;
  }
};
