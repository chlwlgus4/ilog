import { Text, TextInput, type TextStyle } from "react-native";

export const FONT_FAMILY = "Pretendard";

export const pretendardFontMap = {
  Pretendard: require("../assets/fonts/PretendardVariable.ttf"),
  "Pretendard-Regular": require("../assets/fonts/Pretendard-Regular.otf"),
  "Pretendard-Medium": require("../assets/fonts/Pretendard-Medium.otf"),
  "Pretendard-SemiBold": require("../assets/fonts/Pretendard-SemiBold.otf"),
  "Pretendard-Bold": require("../assets/fonts/Pretendard-Bold.otf"),
};

export const typography = {
  h1: { fontFamily: FONT_FAMILY, fontSize: 20, fontWeight: "700" as const },
  h2: { fontFamily: FONT_FAMILY, fontSize: 18, fontWeight: "600" as const },
  title: { fontFamily: FONT_FAMILY, fontSize: 16, fontWeight: "600" as const },
  body: { fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: "400" as const },
  caption: { fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: "400" as const },
  tabular: { fontVariant: ["tabular-nums"] as TextStyle["fontVariant"] },
};

type TextComponentWithDefaults = typeof Text & {
  defaultProps?: {
    style?: unknown;
  };
};

let defaultPropsConfigured = false;

export function configureTypographyDefaults() {
  if (!defaultPropsConfigured) {
    defaultPropsConfigured = true;
    const baseTextStyle: TextStyle = {
      fontFamily: FONT_FAMILY,
      letterSpacing: 0,
    };

    const textComponent = Text as TextComponentWithDefaults;
    textComponent.defaultProps = textComponent.defaultProps ?? {};
    textComponent.defaultProps.style = [baseTextStyle, textComponent.defaultProps.style];

    const textInputComponent = TextInput as unknown as TextComponentWithDefaults;
    textInputComponent.defaultProps = textInputComponent.defaultProps ?? {};
    textInputComponent.defaultProps.style = [baseTextStyle, textInputComponent.defaultProps.style];
  }

  if (typeof document !== "undefined" && !document.getElementById("babyboss-typography")) {
    const style = document.createElement("style");
    style.id = "babyboss-typography";
    style.textContent = `
html, body, #root {
  font-family: ${FONT_FAMILY}, sans-serif;
}

body, button, input, textarea, select, div, span, p {
  font-family: ${FONT_FAMILY}, sans-serif !important;
  letter-spacing: 0 !important;
}
`;
    document.head.appendChild(style);
  }
}
