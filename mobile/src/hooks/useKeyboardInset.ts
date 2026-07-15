import { useEffect, useState } from "react";
import { Keyboard, LayoutAnimation, Platform, type KeyboardEvent, useWindowDimensions } from "react-native";

import { resolveKeyboardComposerAnimationDuration } from "./keyboardAnimationTiming";

function resolveKeyboardLayoutAnimationType(event: KeyboardEvent) {
  switch (event.easing) {
    case "easeIn":
      return LayoutAnimation.Types.easeIn;
    case "easeInEaseOut":
      return LayoutAnimation.Types.easeInEaseOut;
    case "linear":
      return LayoutAnimation.Types.linear;
    case "easeOut":
    case "keyboard":
    default:
      return LayoutAnimation.Types.easeOut;
  }
}

export function useKeyboardInset() {
  const { height: windowHeight } = useWindowDimensions();
  const [keyboardInset, setKeyboardInset] = useState(0);

  useEffect(() => {
    if (Platform.OS === "web") {
      return;
    }

    const measureKeyboardInset = (screenY: number) => Math.max(0, windowHeight - screenY);
    const scheduleKeyboardLayout = (event: KeyboardEvent) => {
      if (Platform.OS === "ios") {
        const duration = resolveKeyboardComposerAnimationDuration(event.duration);

        LayoutAnimation.configureNext({
          duration,
          update: {
            duration,
            type: resolveKeyboardLayoutAnimationType(event),
          },
        });
      }
    };
    const updateKeyboardInset = (event: KeyboardEvent) => {
      scheduleKeyboardLayout(event);
      setKeyboardInset(measureKeyboardInset(event.endCoordinates.screenY));
    };
    const resetKeyboardInset = (event: KeyboardEvent) => {
      scheduleKeyboardLayout(event);
      setKeyboardInset(0);
    };
    const visibleKeyboard = Keyboard.metrics();

    if (visibleKeyboard) {
      setKeyboardInset(measureKeyboardInset(visibleKeyboard.screenY));
    }

    const showSubscription = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillChangeFrame" : "keyboardDidShow",
      updateKeyboardInset,
    );
    const hideSubscription = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      resetKeyboardInset,
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [windowHeight]);

  return keyboardInset;
}
