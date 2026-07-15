import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type PushEventRow = {
  id: number;
  family_id: number;
  recipient_caregiver_id: number;
  title: string;
  body: string;
  data: Record<string, unknown>;
};

type PushTokenRow = {
  family_id: number;
  caregiver_id: number;
  expo_push_token: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-push-worker-secret",
};

function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function secureEquals(left: string, right: string) {
  if (!left || left.length !== right.length) {
    return false;
  }

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return difference === 0;
}

function requestedFamilyId(value: unknown) {
  const familyId = Number(value);
  return Number.isFinite(familyId) && familyId > 0 ? familyId : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = env("SUPABASE_URL");
    const supabaseServiceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
    const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });
    const requested = await req.json().catch(() => ({}));
    const workerSecret = Deno.env.get("PUSH_WORKER_CRON_SECRET")?.trim() ?? "";
    const internalWorker = secureEquals(req.headers.get("x-push-worker-secret")?.trim() ?? "", workerSecret);
    let familyId: number | null = null;

    if (internalWorker) {
      familyId = requestedFamilyId(requested.familyId);
    } else {
      const supabaseAnonKey = env("SUPABASE_ANON_KEY");
      const authorization = req.headers.get("Authorization") ?? "";

      if (!authorization) {
        return jsonResponse({ error: "Authorization header is required" }, 401);
      }

      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false },
      });
      const { data: userPayload, error: userError } = await userClient.auth.getUser();

      if (userError || !userPayload.user) {
        return jsonResponse({ error: "Invalid session" }, 401);
      }

      const { data: caregiver, error: caregiverError } = await serviceClient
        .from("caregivers")
        .select("id,family_id")
        .eq("auth_user_id", userPayload.user.id)
        .maybeSingle();

      if (caregiverError || !caregiver) {
        return jsonResponse({ error: "Caregiver was not found" }, 403);
      }

      familyId = Number(caregiver.family_id);
      const requestedId = requestedFamilyId(requested.familyId);
      if (requestedId != null && requestedId !== familyId) {
        return jsonResponse({ error: "Family access denied" }, 403);
      }
    }

    const enqueueLimit = Number(requested.enqueueLimit ?? 50);
    const safeEnqueueLimit = Number.isFinite(enqueueLimit) ? enqueueLimit : 50;
    const { data: enqueuedRecordAlarms, error: recordAlarmError } = await serviceClient.rpc("enqueue_due_record_alarm_pushes", {
      p_family_id: familyId,
      p_limit: safeEnqueueLimit,
    });

    if (recordAlarmError) {
      throw recordAlarmError;
    }

    const { data: enqueuedTaskReminders, error: taskReminderError } = await serviceClient.rpc("enqueue_due_task_reminder_pushes", {
      p_family_id: familyId,
      p_limit: safeEnqueueLimit,
    });

    if (taskReminderError) {
      throw taskReminderError;
    }

    let eventQuery = serviceClient
      .from("push_notification_events")
      .select("id,family_id,recipient_caregiver_id,title,body,data")
      .eq("status", "PENDING")
      .order("created_at", { ascending: true })
      .limit(25);

    if (familyId != null) {
      eventQuery = eventQuery.eq("family_id", familyId);
    }

    const { data: events, error: eventError } = await eventQuery;

    if (eventError) {
      throw eventError;
    }

    const pendingEvents = (events ?? []) as PushEventRow[];
    if (pendingEvents.length === 0) {
      return jsonResponse({
        processed: 0,
        sent: 0,
        skipped: 0,
        failed: 0,
        enqueuedRecordAlarms: enqueuedRecordAlarms ?? 0,
        enqueuedTaskReminders: enqueuedTaskReminders ?? 0,
      });
    }

    const recipientIds = Array.from(new Set(pendingEvents.map((event) => event.recipient_caregiver_id)));
    const { data: tokens, error: tokenError } = await serviceClient
      .from("push_device_tokens")
      .select("family_id,caregiver_id,expo_push_token")
      .eq("enabled", true)
      .in("caregiver_id", recipientIds);

    if (tokenError) {
      throw tokenError;
    }

    const tokensByCaregiver = new Map<number, string[]>();
    for (const token of (tokens ?? []) as PushTokenRow[]) {
      const current = tokensByCaregiver.get(token.caregiver_id) ?? [];
      current.push(token.expo_push_token);
      tokensByCaregiver.set(token.caregiver_id, current);
    }

    let sent = 0;
    let skipped = 0;
    let failed = 0;
    const expoAccessToken = Deno.env.get("EXPO_ACCESS_TOKEN")?.trim();

    for (const event of pendingEvents) {
      const eventTokens = tokensByCaregiver.get(event.recipient_caregiver_id) ?? [];

      if (eventTokens.length === 0) {
        skipped += 1;
        await serviceClient
          .from("push_notification_events")
          .update({ status: "SKIPPED", error_message: "No registered push token", updated_at: new Date().toISOString() })
          .eq("id", event.id);
        continue;
      }

      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(expoAccessToken ? { Authorization: `Bearer ${expoAccessToken}` } : {}),
        },
        body: JSON.stringify(
          eventTokens.map((token) => ({
            to: token,
            title: event.title,
            body: event.body,
            data: event.data,
            sound: "default",
          })),
        ),
      });

      if (response.ok) {
        sent += 1;
        await serviceClient
          .from("push_notification_events")
          .update({ status: "SENT", sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", event.id);
      } else {
        failed += 1;
        const errorText = await response.text();
        await serviceClient
          .from("push_notification_events")
          .update({
            status: "FAILED",
            attempts: 1,
            error_message: errorText.slice(0, 500),
            updated_at: new Date().toISOString(),
          })
          .eq("id", event.id);
      }
    }

    return jsonResponse({
      processed: pendingEvents.length,
      sent,
      skipped,
      failed,
      enqueuedRecordAlarms: enqueuedRecordAlarms ?? 0,
      enqueuedTaskReminders: enqueuedTaskReminders ?? 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message }, 500);
  }
});
