export function GET() {
  const expires = new Date();
  expires.setUTCFullYear(expires.getUTCFullYear() + 1);
  const body = [
    "Contact: mailto:privacy@haulway.ca",
    "Canonical: https://haulway.ca/.well-known/security.txt",
    "Policy: https://haulway.ca/privacy",
    `Expires: ${expires.toISOString()}`,
    "Preferred-Languages: en",
    "",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
}
