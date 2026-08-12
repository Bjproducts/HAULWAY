export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export function internalError(error: unknown, context: string) {
  console.error(`[${context}]`, error instanceof Error ? error.message : error);
  return jsonError("Something went wrong. Please try again.", 500);
}
