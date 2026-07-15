import { createContext, useContext, type ReactNode } from "react";

import { useBabyBossApp } from "./useBabyBossApp";

type BabyBossAppState = ReturnType<typeof useBabyBossApp>;

const BabyBossAppContext = createContext<BabyBossAppState | null>(null);

export function BabyBossAppProvider({ children }: { children: ReactNode }) {
  const app = useBabyBossApp();
  return <BabyBossAppContext.Provider value={app}>{children}</BabyBossAppContext.Provider>;
}

export function useBabyBossAppContext() {
  const context = useContext(BabyBossAppContext);

  if (!context) {
    throw new Error("BabyBossAppProvider가 필요합니다.");
  }

  return context;
}
