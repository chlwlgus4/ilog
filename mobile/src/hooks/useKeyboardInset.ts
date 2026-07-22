import { useEffect, useRef, useState } from "react";
import { Keyboard, Platform, type KeyboardEvent, useWindowDimensions } from "react-native";

export function useKeyboardInset() {
  const { height: windowHeight } = useWindowDimensions();
  const [keyboardInset, setKeyboardInset] = useState(0);
  const keyboardInsetRef = useRef(0);

  useEffect(() => {
    if (Platform.OS === "web") {
      return;
    }

    const measureKeyboardInset = (screenY: number) => Math.max(0, windowHeight - screenY);
    const scheduleKeyboardLayout = (event: KeyboardEvent) => {
      if (Platform.OS === "ios") {
        Keyboard.scheduleLayoutAnimation(event);
      }
    };
    const updateKeyboardInset = (event: KeyboardEvent) => {
      const nextKeyboardInset = measureKeyboardInset(event.endCoordinates.screenY);

      if (keyboardInsetRef.current === nextKeyboardInset) {
        return;
      }

      keyboardInsetRef.current = nextKeyboardInset;
      scheduleKeyboardLayout(event);
      setKeyboardInset(nextKeyboardInset);
    };
    const resetKeyboardInset = (event: KeyboardEvent) => {
      if (keyboardInsetRef.current === 0) {
        return;
      }

      keyboardInsetRef.current = 0;
      scheduleKeyboardLayout(event);
      setKeyboardInset(0);
    };
    const visibleKeyboard = Keyboard.metrics();

    if (visibleKeyboard) {
      const visibleKeyboardInset = measureKeyboardInset(visibleKeyboard.screenY);
      keyboardInsetRef.current = visibleKeyboardInset;
      setKeyboardInset(visibleKeyboardInset);
    }

    const showSubscription = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
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
