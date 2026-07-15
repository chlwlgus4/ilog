import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";

export function AppleSignInButton({
  label = "Sign in with Apple",
  onPress,
  disabled = false,
  style,
  testID,
}: {
  label?: string;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && !disabled && styles.buttonPressed, disabled && styles.buttonDisabled, style]}
      testID={testID}
    >
      <View style={styles.contentWrapper}>
        <View style={styles.iconBox}>
          <AppleLogoIcon />
        </View>
        <Text style={styles.contents} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

function AppleLogoIcon() {
  return (
    <Svg width={18} height={22} viewBox="0 0 814 1000">
      <Path
        fill="#000000"
        d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zM554.1 159.4c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 44,
    minWidth: 180,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#D9E2F1",
    borderRadius: 4,
    backgroundColor: "#FFFFFF",
    boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08)",
  },
  buttonPressed: {
    backgroundColor: "#F8FAFC",
  },
  buttonDisabled: {
    opacity: 0.62,
  },
  contentWrapper: {
    height: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  iconBox: {
    width: 18,
    height: 22,
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  contents: {
    flexShrink: 1,
    color: "#1F1F1F",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
  },
});
