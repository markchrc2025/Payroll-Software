/**
 * PAY-199: the official blank BIR Form 2316 (September 2021 ENCS), the file
 * Mark supplied on 21 Nov 2026 ("2316 Sep 2021 ENCS Final_corrected.pdf"),
 * kept beside this file (assets/) and read once per process. One page, 612 x
 * 936 pt. Its SHA-256 is pinned: a different file is refused.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const BIR_2316_BLANK_SHA256 = "8e927e65b096d7a786ba7d36c55c28ee3de3546278880d9de8c11a91d1b48d60";
export const BIR_2316_BLANK_PATH = join(process.cwd(), "src/lib/payroll/reports/assets/bir-2316-sep2021-encs.pdf");

let cached: Promise<Uint8Array> | null = null;

export function loadBlank2316(): Promise<Uint8Array> {
  cached ??= readFile(BIR_2316_BLANK_PATH).then((b) => {
    const sha = createHash("sha256").update(b).digest("hex");
    if (sha !== BIR_2316_BLANK_SHA256) throw new Error(`The BIR 2316 blank at ${BIR_2316_BLANK_PATH} is not the supplied file (SHA-256 ${sha})`);
    return new Uint8Array(b);
  });
  cached.catch(() => { cached = null; });
  return cached;
}
