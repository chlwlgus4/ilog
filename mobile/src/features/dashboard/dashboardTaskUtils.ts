export function visibleTaskDescription(description: string | null | undefined) {
  const trimmedDescription = description?.trim();
  return trimmedDescription || null;
}
