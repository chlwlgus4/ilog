import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.108.2";

const familyMediaBucket = "family-media";
const defaultClaimLimit = 1;
const maxClaimsPerInvocation = 1;
const workerDeadlineMs = 45_000;
const removeBatchSize = 500;
const maxPathsPerCleanupPass = 500;
const maxCleanupPasses = 3;

type WorkerDatabase = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<
      string,
      { Args: Record<string, unknown>; Returns: unknown }
    >;
  };
};

type ServiceClient = ReturnType<typeof createClient<WorkerDatabase>>;

type ClaimedCaregiverAccountDeletion = {
  auth_user_id: string;
  claim_token: string;
  attempt_count: number;
};

type ClaimedFamilyDeletion = {
  family_id: number;
  claim_token: string;
  attempt_count: number;
};

type DeletionClaim =
  | { kind: "caregiver"; value: ClaimedCaregiverAccountDeletion }
  | { kind: "family"; value: ClaimedFamilyDeletion };

class WorkerError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "WorkerError";
  }
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new WorkerError("configuration_missing");
  }
  return value;
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

function ensureBeforeDeadline(deadlineAt: number) {
  if (Date.now() >= deadlineAt) {
    throw new WorkerError("worker_deadline_exceeded");
  }
}

async function listFamilyMediaPaths(
  serviceClient: ServiceClient,
  familyId: number,
  claimToken: string,
  maxPaths: number,
  deadlineAt: number,
) {
  ensureBeforeDeadline(deadlineAt);
  const { data, error } = await serviceClient.rpc(
    "list_family_deletion_media_paths",
    {
      p_family_id: familyId,
      p_claim_token: claimToken,
      p_limit: maxPaths,
    },
  );

  if (error || !Array.isArray(data)) {
    throw new WorkerError("storage_list_failed");
  }

  const paths = data.map((row) =>
    typeof row === "object" && row !== null &&
      typeof (row as { storage_path?: unknown }).storage_path === "string"
      ? (row as { storage_path: string }).storage_path
      : null
  );
  if (paths.some((path) => path === null)) {
    throw new WorkerError("storage_list_invalid");
  }

  return [...new Set(paths as string[])];
}

async function removeFamilyMediaPaths(
  serviceClient: ServiceClient,
  paths: string[],
  deadlineAt: number,
) {
  const storage = serviceClient.storage.from(familyMediaBucket);
  for (let start = 0; start < paths.length; start += removeBatchSize) {
    ensureBeforeDeadline(deadlineAt);
    const batch = paths.slice(start, start + removeBatchSize);
    const { error } = await storage.remove(batch);
    if (error) {
      throw new WorkerError("storage_remove_failed");
    }
  }
}

async function cleanupFamilyMedia(
  serviceClient: ServiceClient,
  familyId: number,
  claimToken: string,
  deadlineAt: number,
) {
  for (let pass = 0; pass < maxCleanupPasses; pass += 1) {
    const paths = await listFamilyMediaPaths(
      serviceClient,
      familyId,
      claimToken,
      maxPathsPerCleanupPass,
      deadlineAt,
    );
    if (paths.length === 0) {
      return;
    }
    await removeFamilyMediaPaths(serviceClient, paths, deadlineAt);
  }

  if (
    (await listFamilyMediaPaths(
      serviceClient,
      familyId,
      claimToken,
      1,
      deadlineAt,
    ))
      .length > 0
  ) {
    throw new WorkerError("storage_not_empty");
  }
}

async function listCaregiverMediaPaths(
  serviceClient: ServiceClient,
  authUserId: string,
  claimToken: string,
  maxPaths: number,
  deadlineAt: number,
) {
  ensureBeforeDeadline(deadlineAt);
  const { data, error } = await serviceClient.rpc(
    "list_caregiver_account_deletion_media_paths",
    {
      p_auth_user_id: authUserId,
      p_claim_token: claimToken,
      p_limit: maxPaths,
    },
  );

  if (error || !Array.isArray(data)) {
    throw new WorkerError("caregiver_storage_list_failed");
  }

  const paths = data.map((row) =>
    typeof row === "object" && row !== null &&
      typeof (row as { storage_path?: unknown }).storage_path === "string"
      ? (row as { storage_path: string }).storage_path
      : null
  );
  if (paths.some((path) => path === null)) {
    throw new WorkerError("caregiver_storage_list_invalid");
  }

  return [...new Set(paths as string[])];
}

async function acknowledgeCaregiverMediaRemoval(
  serviceClient: ServiceClient,
  authUserId: string,
  claimToken: string,
  paths: string[],
  deadlineAt: number,
) {
  ensureBeforeDeadline(deadlineAt);
  const { data, error } = await serviceClient.rpc(
    "ack_caregiver_account_deletion_media_paths",
    {
      p_auth_user_id: authUserId,
      p_claim_token: claimToken,
      p_storage_paths: paths,
    },
  );

  if (error || data !== paths.length) {
    throw new WorkerError("caregiver_storage_remove_unconfirmed");
  }
}

async function cleanupCaregiverMedia(
  serviceClient: ServiceClient,
  authUserId: string,
  claimToken: string,
  deadlineAt: number,
) {
  for (let pass = 0; pass < maxCleanupPasses; pass += 1) {
    const paths = await listCaregiverMediaPaths(
      serviceClient,
      authUserId,
      claimToken,
      maxPathsPerCleanupPass,
      deadlineAt,
    );
    if (paths.length === 0) {
      return;
    }

    await removeFamilyMediaPaths(serviceClient, paths, deadlineAt);
    await acknowledgeCaregiverMediaRemoval(
      serviceClient,
      authUserId,
      claimToken,
      paths,
      deadlineAt,
    );
  }

  if (
    (await listCaregiverMediaPaths(
      serviceClient,
      authUserId,
      claimToken,
      1,
      deadlineAt,
    )).length > 0
  ) {
    throw new WorkerError("caregiver_storage_not_empty");
  }
}

function workerErrorCode(error: unknown) {
  return error instanceof WorkerError ? error.code : "worker_failed";
}

async function failCaregiverClaim(
  serviceClient: ServiceClient,
  claim: ClaimedCaregiverAccountDeletion,
  errorCode: string,
) {
  try {
    const { data, error } = await serviceClient.rpc(
      "fail_caregiver_account_deletion_job",
      {
        p_auth_user_id: claim.auth_user_id,
        p_claim_token: claim.claim_token,
        p_error: errorCode,
      },
    );
    return !error && data === true;
  } catch {
    // A failed reschedule keeps the PROCESSING lease. The claim RPC can safely
    // reclaim it after 15 minutes; do not expose or log the raw error or UUID.
    return false;
  }
}

async function failFamilyClaim(
  serviceClient: ServiceClient,
  claim: ClaimedFamilyDeletion,
  errorCode: string,
) {
  try {
    const { data, error } = await serviceClient.rpc(
      "fail_family_deletion_job",
      {
        p_family_id: claim.family_id,
        p_claim_token: claim.claim_token,
        p_error: errorCode,
      },
    );
    return !error && data === true;
  } catch {
    // The stale PROCESSING lease is also the fallback when this RPC fails.
    return false;
  }
}

async function processCaregiverClaim(
  serviceClient: ServiceClient,
  claim: ClaimedCaregiverAccountDeletion,
  deadlineAt: number,
) {
  await cleanupCaregiverMedia(
    serviceClient,
    claim.auth_user_id,
    claim.claim_token,
    deadlineAt,
  );
  ensureBeforeDeadline(deadlineAt);
  let deleteFailed = false;

  try {
    const { error } = await serviceClient.auth.admin.deleteUser(
      claim.auth_user_id,
      true,
    );
    deleteFailed = Boolean(error);
  } catch {
    deleteFailed = true;
  }

  // Always ask the database to confirm the auth.users.deleted_at tombstone.
  // A prior attempt can have completed soft deletion and stopped before this
  // finalize call, in which case a repeated Admin call may report an error.
  const { data, error } = await serviceClient.rpc(
    "finalize_caregiver_account_deletion_job",
    {
      p_auth_user_id: claim.auth_user_id,
      p_claim_token: claim.claim_token,
    },
  );

  if (!error && data === true) {
    return;
  }

  throw new WorkerError(
    deleteFailed ? "auth_soft_delete_failed" : "auth_soft_delete_unconfirmed",
  );
}

async function processFamilyClaim(
  serviceClient: ServiceClient,
  claim: ClaimedFamilyDeletion,
  deadlineAt: number,
) {
  await cleanupFamilyMedia(
    serviceClient,
    claim.family_id,
    claim.claim_token,
    deadlineAt,
  );
  ensureBeforeDeadline(deadlineAt);

  const { data, error } = await serviceClient.rpc(
    "finalize_family_deletion_job",
    {
      p_family_id: claim.family_id,
      p_claim_token: claim.claim_token,
    },
  );

  if (error || data !== true) {
    throw new WorkerError("finalize_failed");
  }
}

async function claimNextDeletion(
  serviceClient: ServiceClient,
  limit: number,
): Promise<DeletionClaim[]> {
  const preferredResult = await serviceClient.rpc(
    "next_due_deletion_job_kind",
    {},
  );
  if (preferredResult.error) {
    throw new WorkerError("deletion_queue_selection_failed");
  }

  const preferredKind = preferredResult.data === "family"
    ? "family"
    : "caregiver";
  const claimOrder = preferredKind === "family"
    ? (["family", "caregiver"] as const)
    : (["caregiver", "family"] as const);

  // A concurrent worker may win the preferred row after queue selection. In
  // that case, try the other queue without claiming more than one job.
  for (const kind of claimOrder) {
    if (kind === "caregiver") {
      const result = await serviceClient.rpc(
        "claim_due_caregiver_account_deletion_jobs",
        { p_limit: limit },
      );
      if (result.error) {
        throw new WorkerError("account_deletion_claim_failed");
      }
      const claims =
        (result.data ?? []) as ClaimedCaregiverAccountDeletion[];
      if (claims.length > 0) {
        return claims.slice(0, limit).map((value) => ({ kind, value }));
      }
      continue;
    }

    const result = await serviceClient.rpc(
      "claim_due_family_deletion_jobs",
      { p_limit: limit },
    );
    if (result.error) {
      throw new WorkerError("family_deletion_claim_failed");
    }
    const claims = (result.data ?? []) as ClaimedFamilyDeletion[];
    if (claims.length > 0) {
      return claims.slice(0, limit).map((value) => ({ kind, value }));
    }
  }

  return [];
}

serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405);
  }

  try {
    const workerSecret = requiredEnv("PUSH_WORKER_CRON_SECRET");
    const providedSecret =
      req.headers.get("x-account-deletion-worker-secret")?.trim() ?? "";
    if (!secureEquals(providedSecret, workerSecret)) {
      return jsonResponse({ error: "INVALID_WORKER_SECRET" }, 401);
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const requestedLimit = Number(body.limit ?? defaultClaimLimit);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(
        Math.max(Math.trunc(requestedLimit), 1),
        maxClaimsPerInvocation,
      )
      : defaultClaimLimit;
    const deadlineAt = Date.now() + workerDeadlineMs;
    const serviceClient = createClient<WorkerDatabase>(
      requiredEnv("SUPABASE_URL"),
      requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );

    let claims: DeletionClaim[];
    try {
      claims = await claimNextDeletion(serviceClient, limit);
    } catch {
      return jsonResponse({ error: "DELETION_JOB_CLAIM_FAILED" }, 503);
    }

    let completed = 0;
    let failed = 0;

    for (const claim of claims) {
      try {
        if (claim.kind === "caregiver") {
          await processCaregiverClaim(serviceClient, claim.value, deadlineAt);
        } else {
          await processFamilyClaim(serviceClient, claim.value, deadlineAt);
        }
        completed += 1;
      } catch (claimError) {
        if (claim.kind === "caregiver") {
          await failCaregiverClaim(
            serviceClient,
            claim.value,
            workerErrorCode(claimError),
          );
        } else {
          await failFamilyClaim(
            serviceClient,
            claim.value,
            workerErrorCode(claimError),
          );
        }
        failed += 1;
      }
    }

    return jsonResponse(
      { claimed: claims.length, completed, failed },
      failed > 0 ? 503 : 200,
    );
  } catch {
    return jsonResponse({ error: "ACCOUNT_DELETION_WORKER_UNAVAILABLE" }, 503);
  }
});
