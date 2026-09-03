export type TaskListRequestOutcome<T> =
  | { version: number; kind: "success"; tasks: T[] }
  | { version: number; kind: "error"; message: string };

export function resolveTaskListRequestOutcome<T>(
  latestVersion: number,
  outcome: TaskListRequestOutcome<T>,
) {
  return outcome.version === latestVersion ? outcome : null;
}
