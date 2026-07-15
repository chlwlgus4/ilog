import { User } from "lucide-react-native";
import { Image, StyleSheet, View } from "react-native";

export function ProfileAvatar({
  size = 40,
  imageUrl,
}: {
  size?: number;
  imageUrl?: string | null;
}) {
  const trimmedImageUrl = typeof imageUrl === "string" ? imageUrl.trim() : "";

  return (
    <View style={[styles.shell, { width: size, height: size, borderRadius: size / 2 }]}>
      {trimmedImageUrl ? (
        <Image source={{ uri: trimmedImageUrl }} style={styles.image} resizeMode="cover" />
      ) : (
        <View style={styles.fallback}>
          <User color="#64748B" size={size * 0.58} strokeWidth={1.8} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "#E7F6F3",
    borderWidth: 1,
    borderColor: "#DDE7E2",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  fallback: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
});
