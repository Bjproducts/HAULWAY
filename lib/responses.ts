export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export function internalError(error: unknown, context: string) {
  if (error instanceof PublicError) return jsonError(error.message, error.status);

  /* A missing environment variable takes down every mutation at once and looks
     identical to a code bug behind the generic 500, which makes it expensive to
     find. Answer 503 instead so the cause is obvious from the response alone,
     without naming the variable to a caller. */
  if (error instanceof ConfigError) {
    console.error(`[${context}] configuration error:`, error.message);
    return jsonError("The service is not fully configured. Check the server environment variables.", 503);
  }

  console.error(`[${context}]`, error instanceof Error ? error.message : error);
  return jsonError("Something went wrong. Please try again.", 500);
}

export class PublicError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = "PublicError";
  }
}

/* Thrown when the deployment is missing configuration it cannot run without. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}
