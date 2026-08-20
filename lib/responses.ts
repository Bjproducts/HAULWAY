export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export function internalError(error: unknown, context: string) {
  if (error instanceof PublicError) return jsonError(error.message, error.status);
  console.error(`[${context}]`, error instanceof Error ? error.message : error);
  return jsonError("Something went wrong. Please try again.", 500);
}

export class PublicError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = "PublicError";
  }
}
