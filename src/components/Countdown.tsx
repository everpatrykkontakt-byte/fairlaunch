"use client";

import { useEffect, useState } from "react";
import { timeLeft } from "@/lib/format";

/** A live, ticking "time left" label that re-renders every second. */
export function Countdown({ iso }: { iso: string | null }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return <>{timeLeft(iso)}</>;
}
