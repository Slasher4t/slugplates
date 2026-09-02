// Every persisted piece of client state (theme, goals, food log) goes through
// this one module instead of calling localStorage directly. That's the whole
// point of it: it's the seam where a future "real accounts" migration plugs
// in. Swapping to Supabase later means giving this file a network-backed
// implementation (keyed by user id instead of a fixed browser key) - nothing
// in the contexts/components that call readJSON/writeJSON has to change.
//
// Decision record: localStorage was chosen over standing up Supabase now
// because there's no auth system yet - without real accounts, "server-side"
// storage would still just be keyed by a random per-browser id generated
// client-side, which is localStorage with extra network latency and infra
// for no actual cross-device benefit. Revisit once accounts exist.

// Deliberately NOT "slugplates." after the SlugEats -> SlugPlates rename:
// this is the actual localStorage key prefix already written to real
// visitors' browsers. Changing it would make every existing goal/log/theme
// entry invisible (the app would look under a new prefix, find nothing, and
// silently fall back to defaults) - a storage-behavior change the rename was
// explicitly scoped to avoid. The brand name is cosmetic; this key is not.
const PREFIX = "slugeats.";

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    // Corrupt value, storage disabled (private browsing), or quota issues -
    // the app should still run, just without persistence.
    return fallback;
  }
}

export function writeJSON<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage full or blocked - silently drop the write, app still works */
  }
}
