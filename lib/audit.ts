import { getSupabase, throwDatabaseError } from "@/db";
import type { AuthSession } from "@/lib/auth";
import { requestFingerprint, requestId } from "@/lib/security";

type AuditInput = {
  request: Request;
  session?: AuthSession | null;
  actorRole?: "customer" | "operator" | "system";
  actorId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
};

export async function recordAuditEvent(input: AuditInput) {
  try {
    const fingerprint = await requestFingerprint(input.request);
    const { error } = await getSupabase().from("audit_events").insert({
      actor_role: input.session?.role ?? input.actorRole ?? "system",
      actor_id: input.session?.subjectId ?? input.actorId ?? null,
      action: input.action.slice(0, 120),
      target_type: input.targetType.slice(0, 60),
      target_id: input.targetId ?? null,
      request_id: requestId(input.request),
      ip_hash: fingerprint.ipHash,
      user_agent_hash: fingerprint.userAgentHash,
      metadata: input.metadata ?? {},
    });
    throwDatabaseError(error);
  } catch (error) {
    // The business mutation has already committed. Do not invite a duplicate
    // retry, but make audit-pipeline failure visible to server monitoring.
    console.error("[audit:write]", error instanceof Error ? error.message : error);
  }
}
