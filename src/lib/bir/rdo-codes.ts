/**
 * PAY-201: BIR Revenue District Office (RDO) codes.
 *
 * Source: BIR Offline eBIRForms Package v7.9.6.2.1 (app/xml/rdo.xml), the list
 * its forms accept in the RDO Code field. Codes only: BIR's file carries no
 * office names. Mark's ruling, 20 Nov 22:57: "get it from the attached files".
 */
import { z } from "zod";

export const RDO_CODES = [
  "001", "002", "003", "004", "005", "006", "007", "008", "009", "010", "011", "012",
  "013", "014", "015", "016", "17A", "17B", "018", "019", "020", "21A", "21B", "21C",
  "022", "23A", "23B", "024", "25A", "25B", "026", "027", "028", "029", "030", "031",
  "032", "033", "034", "035", "036", "037", "038", "039", "040", "041", "042", "043",
  "43A", "43B", "044", "045", "046", "047", "048", "049", "050", "051", "052", "53A",
  "53B", "54A", "54B", "055", "056", "057", "058", "059", "060", "061", "062", "063",
  "064", "065", "066", "067", "068", "069", "070", "071", "072", "073", "074", "075",
  "076", "077", "078", "079", "080", "081", "082", "083", "084", "085", "086", "087",
  "088", "089", "090", "091", "092", "93A", "93B", "094", "095", "096", "097", "098",
  "099", "100", "101", "102", "103", "104", "105", "106", "107", "108", "109", "110",
  "111", "112", "113", "114", "115", "116", "117", "118", "119", "120", "121", "122",
  "123", "124", "125", "126", "127", "132",
] as const;

export type RdoCode = (typeof RDO_CODES)[number];

const SET: ReadonlySet<string> = new Set(RDO_CODES);

/** Normalise user input ("5", " 17a ") to BIR's spelling ("005", "17A"), or null if it is not a BIR code. */
export function normaliseRdoCode(input: string | null | undefined): RdoCode | null {
  if (input == null) return null;
  const raw = input.trim().toUpperCase();
  if (raw === "") return null;
  const padded = /^\d+$/.test(raw) ? raw.padStart(3, "0") : raw;
  return SET.has(padded) ? (padded as RdoCode) : null;
}

export function isRdoCode(input: string): input is RdoCode {
  return SET.has(input);
}

/**
 * Request field for an RDO Code: undefined leaves it alone, "" or null clears
 * it, anything else must be a BIR code and is stored in BIR's spelling.
 */
export const rdoCodeField = z
  .string()
  .max(10)
  .nullish()
  .superRefine((v, ctx) => {
    if (v && v.trim() !== "" && !normaliseRdoCode(v)) {
      ctx.addIssue({ code: "custom", message: "Not a BIR RDO Code (for example 043 or 17A)." });
    }
  })
  .transform((v) => (v === undefined ? undefined : normaliseRdoCode(v)));
