"use client";

import { useInactivityDecay } from "@/lib/padel-queries";

export function InactivityDecayRunner() {
  useInactivityDecay();
  return null;
}
