// How long one request to Supabase may take. A page that waits on a stuck
// query should fail with an error in seconds, not hold the visitor (and a
// function) until the platform's five-minute limit.
const TIMEOUT_MS = 15_000;

/** `fetch` that gives up after TIMEOUT_MS, for the server's Supabase clients. */
export const fetchWithTimeout: typeof fetch = (input, init) => {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  return fetch(input, {
    ...init,
    signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
  });
};
