/** Auth epochs reject another account's response; revisions reject pre-mutation reads. */
export function createSafetyRequestEpoch() {
  let authEpoch = 0;
  let revision = 0;
  return {
    capture: () => ({ authEpoch, revision }),
    acceptsRead: (request: { authEpoch: number; revision: number }) => request.authEpoch === authEpoch && request.revision === revision,
    acceptsMutation: (request: { authEpoch: number }) => request.authEpoch === authEpoch,
    invalidateReads: () => { revision += 1; },
    resetAuth: () => { authEpoch += 1; revision += 1; },
  };
}
