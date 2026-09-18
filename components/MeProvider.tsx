"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { BillingAccount, PublicUser } from "@/lib/types";

export type MePayload = {
  user: PublicUser;
  entitlements: {
    companyPlan: string;
    storagePlan: string;
    maxCompanies: number;
    maxStorageBytes: number;
    isAdmin: boolean;
    fetchCadence?: string;
    maxFetchHistory?: number;
    fetchEnabled?: boolean;
  };
  billing: BillingAccount | {
    companyPlan: "free";
    storagePlan: "free";
    status: "none";
  };
  usage: { bytesUsed: number; updatedAt: string };
};

type MeContextValue = {
  me: MePayload | null;
  loading: boolean;
  error: string | null;
  refreshMe: () => Promise<void>;
};

const MeContext = createContext<MeContextValue | null>(null);

export function MeProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshMe = useCallback(async () => {
    try {
      const res = await fetch("/api/me");
      if (!res.ok) {
        setError(res.status === 401 ? "Unauthorized" : "Failed to load /api/me");
        setMe(null);
        return;
      }
      const data = (await res.json()) as MePayload;
      setMe(data);
      setError(null);
    } catch {
      setError("Network error loading /api/me");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  const value = useMemo(
    () => ({ me, loading, error, refreshMe }),
    [me, loading, error, refreshMe],
  );

  return <MeContext.Provider value={value}>{children}</MeContext.Provider>;
}

export function useMe(): MeContextValue {
  const ctx = useContext(MeContext);
  if (!ctx) {
    throw new Error("useMe must be used within MeProvider");
  }
  return ctx;
}

/** Soft hook for optional nesting — returns null outside provider. */
export function useMeOptional(): MeContextValue | null {
  return useContext(MeContext);
}
