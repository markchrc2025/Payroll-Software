"use client";

import { useState } from "react";

/** Toggle switch (cp design). Local state only — wire to a real setting later. */
export function SecurityToggle({ defaultOn = false }: { defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <button
      type="button"
      className={"cp-toggle" + (on ? " is-on" : "")}
      aria-pressed={on}
      onClick={() => setOn((v) => !v)}
    >
      <span />
    </button>
  );
}
