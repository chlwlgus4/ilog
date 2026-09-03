let inFlightLogout: Promise<void> | null = null;

export function performLogoutWithPushCleanup({
  cleanupPush,
  signOut,
  finishPushCleanup,
}: {
  cleanupPush: () => Promise<void>;
  signOut: () => Promise<void>;
  finishPushCleanup?: () => void;
}) {
  if (inFlightLogout) {
    return inFlightLogout;
  }

  const operation = (async () => {
    try {
      await cleanupPush();
    } catch {
      // Native push unregistration and server cleanup are both attempted by
      // the caller. A cleanup outage must not trap a caregiver inside the app.
    }

    try {
      await signOut();
    } finally {
      finishPushCleanup?.();
    }
  })();
  const trackedOperation = operation.finally(() => {
    if (inFlightLogout === trackedOperation) {
      inFlightLogout = null;
    }
  });
  inFlightLogout = trackedOperation;
  return trackedOperation;
}

export async function retryLogoutNotificationCleanup({
  cleanupSteps,
  maxAttempts = 2,
}: {
  cleanupSteps: ReadonlyArray<() => Promise<void>>;
  maxAttempts?: number;
}) {
  const attempts = Math.max(1, Math.trunc(maxAttempts));

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const results = await Promise.allSettled(
      cleanupSteps.map((step) => Promise.resolve().then(step)),
    );
    if (results.every((result) => result.status === "fulfilled")) {
      return true;
    }
  }

  return false;
}
