const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function childAgeInMonths(birthDate: string, referenceDate = new Date()): number | null {
  const birth = parseDateOnly(birthDate);

  if (!birth || Number.isNaN(referenceDate.getTime())) {
    return null;
  }

  let months = (referenceDate.getFullYear() - birth.getFullYear()) * 12 + (referenceDate.getMonth() - birth.getMonth());

  if (referenceDate.getDate() < birth.getDate()) {
    months -= 1;
  }

  return Math.max(months, 0);
}

export function formatChildAge(birthDate: string, referenceDate = new Date()): string | null {
  const months = childAgeInMonths(birthDate, referenceDate);

  if (months === null) {
    return null;
  }

  return `${months}개월 · ${Math.floor(months / 12)}세`;
}

function parseDateOnly(value: string) {
  const match = DATE_ONLY_PATTERN.exec(value.trim());

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return date;
}
