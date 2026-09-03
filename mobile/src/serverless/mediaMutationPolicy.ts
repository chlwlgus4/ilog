export async function commitUploadedMedia<TRecord, TResolved, TRecovered>({
  commitRecord,
  resolveCommittedRecord,
  cleanupUncommittedUpload,
  recoverCommittedRecord,
}: {
  commitRecord: () => Promise<TRecord>;
  resolveCommittedRecord: (record: TRecord) => Promise<TResolved>;
  cleanupUncommittedUpload: () => Promise<void>;
  recoverCommittedRecord: (record: TRecord, error: unknown) => Promise<TRecovered> | TRecovered;
}): Promise<TResolved | TRecovered> {
  let record: TRecord;

  try {
    record = await commitRecord();
  } catch (error) {
    await cleanupUncommittedUpload().catch(() => undefined);
    throw error;
  }

  try {
    return await resolveCommittedRecord(record);
  } catch (error) {
    // The database row now owns the uploaded object. Never compensate by
    // deleting Storage after this boundary; return a refreshable fallback.
    return recoverCommittedRecord(record, error);
  }
}

export async function deleteMediaStorageFirst<TResult>({
  deleteStorage,
  deleteRecord,
}: {
  deleteStorage: () => Promise<void>;
  deleteRecord: () => Promise<TResult>;
}) {
  await deleteStorage();
  return deleteRecord();
}
