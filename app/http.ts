/*
 * Shared fetch plumbing for both the customer app and the operator portal.
 *
 * The previous copies called response.json() before checking response.ok, so any
 * non-JSON failure (a proxy timeout, an HTML error page, an empty body) threw a
 * SyntaxError and the user was shown "Unexpected token '<'". Read the body as
 * text first, then fall back to a message that says what to do about it.
 */

export async function readJson(response: Response) {
  const text = await response.text();
  let data: { error?: string } = {};
  if (text) {
    try { data = JSON.parse(text) as { error?: string }; } catch { /* not JSON — fall through */ }
  }
  if (!response.ok) throw new Error(data.error || statusMessage(response.status));
  return data;
}

function statusMessage(status: number) {
  if (status === 401 || status === 403) return "Your session expired. Sign in again to continue.";
  if (status === 404) return "We couldn't find that — it may have been cancelled.";
  if (status === 409) return "That changed while you were away. Pull down to refresh and try again.";
  if (status === 413) return "That file is too large. Try a smaller photo.";
  if (status === 429) return "Too many attempts. Wait a minute, then try again.";
  if (status >= 500) return "Haulway is having trouble right now. Try again in a moment.";
  return "Something went wrong. Try again.";
}

export function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  /* A dropped connection surfaces as a bare TypeError from fetch. */
  return "You appear to be offline. Check your connection and try again.";
}
