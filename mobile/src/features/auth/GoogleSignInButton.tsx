import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";

export function GoogleSignInButton({
  label = "Sign in with Google",
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
      <View style={styles.state} />
      <View style={styles.contentWrapper}>
        <View style={styles.iconBox}>
          <GoogleGIcon />
        </View>
        <Text style={styles.contents} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

function GoogleGIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 48 48">
      <Path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <Path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <Path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <Path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
      <Path fill="none" d="M0 0h48v48H0z" />
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
  state: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#303030",
    opacity: 0,
    pointerEvents: "none",
  },
  contentWrapper: {
    height: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  iconBox: {
    width: 20,
    height: 20,
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
