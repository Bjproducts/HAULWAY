import { getStorage, getSupabase, throwDatabaseError } from "@/db";

export async function runSafeRetentionMaintenance() {
  const db = getSupabase();
  const now = new Date();
  const draftRetentionHours = configuredDraftRetentionHours();
  const abandonedBefore = draftRetentionHours == null
    ? null
    : new Date(now.getTime() - draftRetentionHours * 60 * 60 * 1000).toISOString();
  const rateLimitBefore = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();

  let drafts: Array<{ id: string }> = [];
  if (abandonedBefore) {
    const { data, error } = await db.from("jobs")
      .select("id")
      .eq("upload_complete", false)
      .lt("created_at", abandonedBefore)
      .order("created_at", { ascending: true })
      .limit(100);
    throwDatabaseError(error);
    drafts = data ?? [];
  }

  let removedObjects = 0;
  for (const draft of drafts) {
    const { data: media, error: mediaError } = await db.from("job_media")
      .select("object_key")
      .eq("job_id", draft.id);
    throwDatabaseError(mediaError);
    const keys = (media ?? []).map((row) => row.object_key);
    if (keys.length) {
      const { error } = await getStorage().remove(keys);
      throwDatabaseError(error);
      removedObjects += keys.length;
    }
    const { error: deleteError } = await db.from("jobs")
      .delete()
      .eq("id", draft.id)
      .eq("upload_complete", false);
    throwDatabaseError(deleteError);
  }

  const { error: sessionError } = await db.from("sessions").delete().lt("expires_at", now.toISOString());
  throwDatabaseError(sessionError);
  const { error: rateLimitError } = await db.from("rate_limits").delete().lt("updated_at", rateLimitBefore);
  throwDatabaseError(rateLimitError);

  const summary = {
    draftCleanup: draftRetentionHours == null ? "disabled" : "enabled",
    draftRetentionHours,
    abandonedDrafts: drafts.length,
    removedObjects,
  };
  if (summary.abandonedDrafts || summary.removedObjects) {
    const { error } = await db.from("audit_events").insert({
      actor_role: "system",
      action: "retention.safe_maintenance",
      target_type: "system",
      metadata: summary,
    });
    throwDatabaseError(error);
  }
  return summary;
}

function configuredDraftRetentionHours() {
  const configured = process.env.ABANDONED_DRAFT_RETENTION_HOURS?.trim();
  if (!configured) return null;
  if (!/^\d+$/.test(configured)) throw new Error("ABANDONED_DRAFT_RETENTION_HOURS must be a whole number.");
  const hours = Number(configured);
  if (hours < 24 || hours > 8760) throw new Error("ABANDONED_DRAFT_RETENTION_HOURS must be between 24 and 8760.");
  return hours;
}
