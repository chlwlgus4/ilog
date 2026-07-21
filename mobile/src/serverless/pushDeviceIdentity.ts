type DeviceIdentifiers = {
  platform: string;
  iosId: string | null | undefined;
  androidId: string | null | undefined;
};

export function stablePushDeviceId({ platform, iosId, androidId }: DeviceIdentifiers) {
  if (platform === "ios") {
    return normalizeDeviceId(iosId);
  }

  if (platform === "android") {
    return normalizeDeviceId(androidId);
  }

  return null;
}

function normalizeDeviceId(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
