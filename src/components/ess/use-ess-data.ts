"use client";

import { useEffect, useState } from "react";
import { essFetch, EssUnauthorized } from "./api";

/** Fetch ESS JSON on mount. Returns loading/error and the parsed payload. */
export function useEssData<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(path !== null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (path === null) return;
    let alive = true;
    setLoading(true);
    setError("");
    essFetch<T>(path)
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e) => {
        if (!alive || e instanceof EssUnauthorized) return;
        setError(e instanceof Error ? e.message : "Couldn't load data.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [path]);

  return { data, loading, error };
}
