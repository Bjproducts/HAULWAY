import { getStorage, getSupabase, throwDatabaseError } from "@/db";

export async function runSafeRetentionMaintenance() {
  const db = getSupabase();
  const now = new Date();
  const abandonedBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const rateLimitBefore = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();

  const { data: drafts, error: draftError } = await db.from("jobs")
    .select("id")
    .eq("upload_complete", false)
    .lt("created_at", abandonedBefore)
    .order("created_at", { ascending: true })
    .limit(100);
  throwDatabaseError(draftError);

  let removedObjects = 0;
  for (const draft of drafts ?? []) {
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

  const summary = { abandonedDrafts: drafts?.length ?? 0, removedObjects };
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
