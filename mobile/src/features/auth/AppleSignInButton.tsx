import * as AppleAuthentication from "expo-apple-authentication";
import { Platform, StyleSheet, type StyleProp, type ViewStyle } from "react-native";

export function AppleSignInButton({
  label = "Sign in with Apple",
  variant = "signIn",
  onPress = () => undefined,
  disabled = false,
  style,
  testID,
}: {
  label?: string;
  variant?: "signIn" | "signUp";
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  if (Platform.OS !== "ios") {
    return null;
  }

  return (
    <AppleAuthentication.AppleAuthenticationButton
      accessibilityLabel={label}
      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
      buttonType={variant === "signUp"
        ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
        : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
      cornerRadius={4}
      onPress={disabled ? () => undefined : onPress}
      style={[styles.button, disabled && styles.buttonDisabled, style]}
      testID={testID}
    />
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
  },
  buttonDisabled: {
    opacity: 0.62,
  },
});
