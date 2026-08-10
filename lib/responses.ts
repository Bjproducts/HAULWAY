export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}
