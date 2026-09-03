export class PushRegistrationLifecycle {
  private generation = 0;
  private blocked = false;
  private activeLogoutCount = 0;
  private readonly registrations = new Set<Promise<unknown>>();

  resumeForAuthenticatedSession() {
    if (this.activeLogoutCount > 0) {
      return false;
    }

    this.generation += 1;
    this.blocked = false;
    return true;
  }

  beginRegistration() {
    return this.blocked ? null : this.generation;
  }

  isRegistrationCurrent(generation: number) {
    return !this.blocked && generation === this.generation;
  }

  track<T>(registration: Promise<T>) {
    this.registrations.add(registration);
    void registration.finally(() => {
      this.registrations.delete(registration);
    }).catch(() => {
      // The caller observes the original promise. This branch only prevents
      // the bookkeeping promise from becoming an unhandled rejection.
    });
    return registration;
  }

  async blockForLogoutAndWait() {
    this.activeLogoutCount += 1;
    this.blocked = true;
    this.generation += 1;
    await Promise.allSettled([...this.registrations]);
  }

  finishLogout() {
    this.activeLogoutCount = Math.max(0, this.activeLogoutCount - 1);
  }
}
