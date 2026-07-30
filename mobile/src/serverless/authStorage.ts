import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const secureChunkLength = 1800;
const secureMetadataSuffix = ".chunks";
const secureChunkSuffix = ".chunk.";
const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
const secureOperations = new Map<string, Promise<unknown>>();

type ChunkMetadata = {
  count: number;
};

function metadataKey(key: string) {
  return `${key}${secureMetadataSuffix}`;
}

function chunkKey(key: string, index: number) {
  return `${key}${secureChunkSuffix}${index}`;
}

function enqueueSecureOperation<T>(key: string, operation: () => Promise<T>) {
  const previous = secureOperations.get(key) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);

  secureOperations.set(key, current);

  return current.finally(() => {
    if (secureOperations.get(key) === current) {
      secureOperations.delete(key);
    }
  });
}

function splitValue(value: string) {
  const chunks: string[] = [];

  for (let index = 0; index < value.length; index += secureChunkLength) {
    chunks.push(value.slice(index, index + secureChunkLength));
  }

  return chunks.length > 0 ? chunks : [""];
}

function parseChunkMetadata(value: string | null): ChunkMetadata | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<ChunkMetadata>;
    return Number.isInteger(parsed.count) && Number(parsed.count) > 0
      ? { count: Number(parsed.count) }
      : null;
  } catch {
    return null;
  }
}

async function readSecureValue(key: string) {
  const metadata = parseChunkMetadata(
    await SecureStore.getItemAsync(metadataKey(key), secureStoreOptions),
  );

  if (!metadata) {
    return SecureStore.getItemAsync(key, secureStoreOptions);
  }

  const chunks = await Promise.all(
    Array.from({ length: metadata.count }, (_, index) =>
      SecureStore.getItemAsync(chunkKey(key, index), secureStoreOptions),
    ),
  );

  if (chunks.some((chunk) => chunk == null)) {
    await removeSecureValue(key, metadata.count);
    return null;
  }

  return chunks.join("");
}

async function writeSecureValue(key: string, value: string) {
  const previousMetadata = parseChunkMetadata(
    await SecureStore.getItemAsync(metadataKey(key), secureStoreOptions),
  );
  const chunks = splitValue(value);

  await Promise.all(
    chunks.map((chunk, index) =>
      SecureStore.setItemAsync(chunkKey(key, index), chunk, secureStoreOptions),
    ),
  );
  await SecureStore.setItemAsync(
    metadataKey(key),
    JSON.stringify({ count: chunks.length } satisfies ChunkMetadata),
    secureStoreOptions,
  );
  await SecureStore.deleteItemAsync(key, secureStoreOptions);

  if (previousMetadata && previousMetadata.count > chunks.length) {
    await Promise.all(
      Array.from(
        { length: previousMetadata.count - chunks.length },
        (_, offset) =>
          SecureStore.deleteItemAsync(
            chunkKey(key, chunks.length + offset),
            secureStoreOptions,
          ),
      ),
    );
  }
}

async function removeSecureValue(key: string, knownChunkCount?: number) {
  const metadata = knownChunkCount
    ? { count: knownChunkCount }
    : parseChunkMetadata(
        await SecureStore.getItemAsync(metadataKey(key), secureStoreOptions),
      );

  await Promise.all([
    SecureStore.deleteItemAsync(key, secureStoreOptions),
    SecureStore.deleteItemAsync(metadataKey(key), secureStoreOptions),
    ...(metadata
      ? Array.from({ length: metadata.count }, (_, index) =>
          SecureStore.deleteItemAsync(chunkKey(key, index), secureStoreOptions),
        )
      : []),
  ]);
}

export const authStorage = {
  async getItem(key: string) {
    if (Platform.OS === "web") {
      return AsyncStorage.getItem(key);
    }

    return enqueueSecureOperation(key, async () => {
      const secureValue = await readSecureValue(key);
      if (secureValue != null) {
        return secureValue;
      }

      const legacyValue = await AsyncStorage.getItem(key);
      if (legacyValue == null) {
        return null;
      }

      await writeSecureValue(key, legacyValue);
      await AsyncStorage.removeItem(key);

      return legacyValue;
    });
  },

  async setItem(key: string, value: string) {
    if (Platform.OS === "web") {
      await AsyncStorage.setItem(key, value);
      return;
    }

    await enqueueSecureOperation(key, async () => {
      await writeSecureValue(key, value);
      await AsyncStorage.removeItem(key);
    });
  },

  async removeItem(key: string) {
    if (Platform.OS === "web") {
      await AsyncStorage.removeItem(key);
      return;
    }

    await enqueueSecureOperation(key, async () => {
      await Promise.all([
        removeSecureValue(key),
        AsyncStorage.removeItem(key),
      ]);
    });
  },
};
