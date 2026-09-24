"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ActiveOrgState {
  activeOrgId: string | null;
  setActiveOrgId: (id: string | null) => void;
}

/** Active organization, persisted per browser. */
export const useActiveOrgStore = create<ActiveOrgState>()(
  persist(
    (set) => ({
      activeOrgId: null,
      setActiveOrgId: (activeOrgId) => set({ activeOrgId }),
    }),
    { name: "adwise-active-org" },
  ),
);
