import { useState } from "react";

/**
 * `value` while `live`, and the last live value otherwise. The home page
 * keeps both tabs' lists mounted; each reads its filters from the URL, which
 * belongs to whichever tab is showing, so the hidden one holds what it had
 * instead of re-filtering to the other tab's parameters.
 */
export function useHeld<T>(value: T, live: boolean): T {
  const [held, setHeld] = useState(value);
  if (live && held !== value) setHeld(value);
  return live ? value : held;
}
