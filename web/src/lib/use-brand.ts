"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  BRAND_STORAGE_KEY,
  DEFAULT_BRAND,
  applyBrand,
  isBrand,
  type BrandId,
} from "@/lib/brand";

const listeners = new Set<() => void>();

function read(): BrandId {
  try {
    const v = localStorage.getItem(BRAND_STORAGE_KEY);
    return isBrand(v) ? v : DEFAULT_BRAND;
  } catch {
    return DEFAULT_BRAND;
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === BRAND_STORAGE_KEY) {
      applyBrand(read());
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** Current brand + setter. Persisted in localStorage, applied to <html data-brand>. */
export function useBrand() {
  const brand = useSyncExternalStore(subscribe, read, () => DEFAULT_BRAND);
  const setBrand = useCallback((next: BrandId) => {
    try {
      localStorage.setItem(BRAND_STORAGE_KEY, next);
    } catch {
      /* storage unavailable: still apply for this session */
    }
    applyBrand(next);
    listeners.forEach((l) => l());
  }, []);
  return { brand, setBrand };
}
