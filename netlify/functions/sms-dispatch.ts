import { dispatchPendingSms } from "../../lib/sms";

export default async function handler() {
  try {
    return Response.json(await dispatchPendingSms(50));
  } catch (error) {
    console.error("[sms:scheduled-dispatch]", error instanceof Error ? error.message : error);
    return Response.json({ error: "SMS dispatch failed." }, { status: 500 });
  }
}

export const config = { schedule: "* * * * *" };
