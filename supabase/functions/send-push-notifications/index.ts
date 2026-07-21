import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type PushEventRow = {
  id: number;
  family_id: number;
  recipient_caregiver_id: number;
  actor_caregiver_id: number | null;
  event_type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  attempts: number;
};

type PushTokenRow = {
  family_id: number;
  caregiver_id: number;
  expo_push_token: string;
};

type CaregiverPushPreferenceRow = {
  id: number;
  push_notifications_enabled: boolean;
  chat_notifications_enabled: boolean;
};

type ExpoPushDeliveryResult = {
  sent: boolean;
  errorMessage?: string;
  disableToken?: boolean;
};

const chatPushEventTypes = ["FAMILY_CHAT", "FAMILY_CHAT_MENTION"] as const;
type ChatPushEventType = (typeof chatPushEventTypes)[number];

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

function isChatPushEvent(eventType: string) {
  return (chatPushEventTypes as readonly string[]).includes(eventType);
}

function requestedChatPushEventTypes(value: unknown): ChatPushEventType[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value.filter((eventType): eventType is ChatPushEventType =>
        typeof eventType === "string" && isChatPushEvent(eventType),
      ),
    ),
  );
}

function deliverySkipReason(event: PushEventRow, preference: CaregiverPushPreferenceRow | undefined) {
  if (
    isChatPushEvent(event.event_type)
    && event.actor_caregiver_id != null
    && event.actor_caregiver_id === event.recipient_caregiver_id
  ) {
    return "Chat messages are not delivered to their sender";
  }

  if (preference && !preference.push_notifications_enabled) {
    return "Push notifications disabled in recipient settings";
  }

  if (preference && isChatPushEvent(event.event_type) && !preference.chat_notifications_enabled) {
    return "Chat push notifications disabled in recipient settings";
  }

  return null;
}

function objectErrorMessage(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  for (const candidate of [record.message, record.error, record.code, record.details]) {
    const message = objectErrorMessage(candidate);
    if (message) {
      return message;
    }
  }

  return null;
}

function responseErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "Expo push response could not be verified";
  }

  const response = payload as Record<string, unknown>;
  const tickets = Array.isArray(response.data) ? response.data : [];
  const firstTicket = tickets[0] && typeof tickets[0] === "object" ? (tickets[0] as Record<string, unknown>) : null;
  const firstError = Array.isArray(response.errors) && response.errors[0] && typeof response.errors[0] === "object"
    ? (response.errors[0] as Record<string, unknown>)
    : null;
  const ticketStatus = typeof firstTicket?.status === "string" ? firstTicket.status : null;
  const errorMessage = objectErrorMessage(firstTicket) ?? objectErrorMessage(firstError);

  if (ticketStatus === "ok" && !firstError) {
    return null;
  }

  if (ticketStatus === "error" || firstError) {
    return errorMessage ?? "Expo push request returned an error";
  }

  return errorMessage ?? "Expo push response could not be verified";
}

async function sendExpoPush(
  token: string,
  event: PushEventRow,
  expoAccessToken: string | undefined,
): Promise<ExpoPushDeliveryResult> {
  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(expoAccessToken ? { Authorization: `Bearer ${expoAccessToken}` } : {}),
    },
    // A request contains one token only. Expo rejects mixed EAS project IDs in one batch.
    body: JSON.stringify([{
      to: token,
      title: event.title,
      body: event.body,
      data: event.data,
      sound: "default",
    }]),
  });
  const rawResponse = await response.text();
  let payload: unknown = null;

  try {
    payload = rawResponse ? JSON.parse(rawResponse) : null;
  } catch {
    payload = null;
  }

  const responseError = responseErrorMessage(payload);
  if (response.ok && !responseError) {
    return { sent: true };
  }

  const errorMessage = responseError ?? (rawResponse || `Expo push request failed (${response.status})`);
  return {
    sent: false,
    errorMessage,
    disableToken: errorMessage.includes("DeviceNotRegistered"),
  };
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
    const requestedEventTypes = requestedChatPushEventTypes(requested.eventTypes);
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

    const { data: events, error: eventError } = await serviceClient.rpc("claim_pending_push_notification_events", {
      p_family_id: familyId,
      p_event_types: requestedEventTypes.length > 0 ? requestedEventTypes : null,
      p_limit: 25,
    });

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
    const [{ data: tokens, error: tokenError }, { data: recipientPreferences, error: preferenceError }] = await Promise.all([
      serviceClient
        .from("push_device_tokens")
        .select("family_id,caregiver_id,expo_push_token")
        .eq("enabled", true)
        .in("caregiver_id", recipientIds),
      serviceClient
        .from("caregivers")
        .select("id,push_notifications_enabled,chat_notifications_enabled")
        .in("id", recipientIds),
    ]);

    if (tokenError) {
      throw tokenError;
    }
    if (preferenceError) {
      throw preferenceError;
    }

    const tokensByCaregiver = new Map<number, Set<string>>();
    for (const token of (tokens ?? []) as PushTokenRow[]) {
      const current = tokensByCaregiver.get(token.caregiver_id) ?? new Set<string>();
      current.add(token.expo_push_token);
      tokensByCaregiver.set(token.caregiver_id, current);
    }
    const preferencesByCaregiver = new Map(
      ((recipientPreferences ?? []) as CaregiverPushPreferenceRow[]).map((preference) => [preference.id, preference]),
    );

    let sent = 0;
    let skipped = 0;
    let failed = 0;
    const expoAccessToken = Deno.env.get("EXPO_ACCESS_TOKEN")?.trim();

    for (const event of pendingEvents) {
      const skipReason = deliverySkipReason(event, preferencesByCaregiver.get(event.recipient_caregiver_id));
      if (skipReason) {
        skipped += 1;
        await serviceClient
          .from("push_notification_events")
          .update({
            status: "SKIPPED",
            processing_started_at: null,
            error_message: skipReason,
            updated_at: new Date().toISOString(),
          })
          .eq("id", event.id)
          .eq("status", "PROCESSING");
        continue;
      }

      const eventTokens = Array.from(tokensByCaregiver.get(event.recipient_caregiver_id) ?? []);

      if (eventTokens.length === 0) {
        skipped += 1;
        await serviceClient
          .from("push_notification_events")
          .update({
            status: "SKIPPED",
            processing_started_at: null,
            error_message: "No registered push token",
            updated_at: new Date().toISOString(),
          })
          .eq("id", event.id)
          .eq("status", "PROCESSING");
        continue;
      }

      let sentToAtLeastOneDevice = false;
      const deliveryErrors: string[] = [];

      for (const token of eventTokens) {
        const result = await sendExpoPush(token, event, expoAccessToken);
        if (result.sent) {
          sentToAtLeastOneDevice = true;
          continue;
        }

        deliveryErrors.push(result.errorMessage ?? "Expo push request failed");
        if (result.disableToken) {
          await serviceClient
            .from("push_device_tokens")
            .update({ enabled: false, updated_at: new Date().toISOString() })
            .eq("family_id", event.family_id)
            .eq("caregiver_id", event.recipient_caregiver_id)
            .eq("expo_push_token", token);
        }
      }

      if (sentToAtLeastOneDevice) {
        sent += 1;
        await serviceClient
          .from("push_notification_events")
          .update({
            status: "SENT",
            sent_at: new Date().toISOString(),
            processing_started_at: null,
            error_message: deliveryErrors.length > 0 ? deliveryErrors.join(" | ").slice(0, 500) : null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", event.id)
          .eq("status", "PROCESSING");
      } else {
        failed += 1;
        await serviceClient
          .from("push_notification_events")
          .update({
            status: "FAILED",
            attempts: event.attempts + 1,
            processing_started_at: null,
            error_message: deliveryErrors.join(" | ").slice(0, 500) || "Expo push request failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", event.id)
          .eq("status", "PROCESSING");
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
