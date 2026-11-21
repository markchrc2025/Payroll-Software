/**
 * PAY-200: the BIR 1604-C alphalist as the .DAT file that BIR's Alphalist Data
 * Entry and Validation module (version 7.4) accepts, with that module's
 * validation rules built in.
 *
 * Mark's ruling 6 (20 Nov 22:57): ".DAT: Get it from BIR validation module."
 * The format is written down in docs/BIR_ALPHALIST_DAT.md. Where BIR's
 * data-entry tool and its validator disagree, the validator decides (the
 * control lines carry no PERA total).
 *
 * The figures are the 1604-C schedule rows, read by column number, so the
 * file always agrees with the printed alphalist.
 */
import {
  alphalistScheduleEmployees, buildBir1604cReport, SCHEDULE_1_COLUMNS, SCHEDULE_2_COLUMNS,
  type Bir1604cEmployeeInput, type Bir1604cInput, type Bir1604cReport,
} from "./bir-1604c";
import { formatMdy } from "./bir-form";

export interface DatIssue {
  /** "error": BIR's validator rejects the file. "warning": the file was changed to pass. */
  severity: "error" | "warning";
  /** 1-based line in the file (0 for the file as a whole). */
  line: number;
  /** 1-based column (0 when it is not one column). */
  column: number;
  employee?: string;
  message: string;
}

export interface AlphalistDat {
  fileName: string;
  /** Lines joined with CR LF, ending with CR LF. */
  content: string;
  issues: DatIssue[];
  /** True when the file has no errors. */
  valid: boolean;
}

/** Sentire's region values (work locations, employees) to BIR's region codes. */
const REGION_TO_BIR: Record<string, string> = {
  NCR: "NCR", CAR: "CAR", BARMM: "ARMM", ARMM: "ARMM",
  REGION_I: "I", REGION_II: "II", REGION_III: "III", REGION_IV_A: "IV-A", REGION_IV_B: "IV-B",
  REGION_V: "V", REGION_VI: "VI", REGION_VII: "VII", REGION_VIII: "VIII", REGION_IX: "IX",
  REGION_X: "X", REGION_XI: "XI", REGION_XII: "XII", REGION_XIII: "XIII",
};
const BIR_REGIONS = new Set([
  "I", "II", "III", "IV-A", "IV-B", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII",
  "NCR", "ARMM", "CAR", "1", "2", "3", "4-A", "4-B", "5", "6", "7", "8", "9", "10", "11", "12", "13",
]);
export function birRegionCode(region: string | null | undefined): string | null {
  if (!region) return null;
  const r = region.trim().toUpperCase();
  return REGION_TO_BIR[r] ?? (BIR_REGIONS.has(r) ? r : null);
}

const STATUS_CODES = new Set(["R", "C", "CP", "S", "P", "AL"]);
const REASON_CODES = new Set(["T", "TR", "R", "D"]);

/** Centavos as BIR's plain amount: "1234.56", "0.00", "-12.00". */
export function datAmount(cents: string | bigint | null | undefined): string {
  const n = cents == null || cents === "" ? 0n : BigInt(cents);
  const neg = n < 0n;
  const a = neg ? -n : n;
  return `${neg ? "-" : ""}${a / 100n}.${(a % 100n).toString().padStart(2, "0")}`;
}

/** A name as BIR's validator accepts it: ASCII 32 to 126 without " & ' , |. */
export function datName(raw: string | null | undefined): { value: string; changed: boolean } {
  const src = (raw ?? "").trim();
  const value = src
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, "AND")
    .replace(/["',|]/g, "")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  return { value, changed: value !== src.toUpperCase() };
}

/** "123-456-789-00000" to TIN "123456789" and branch "0000". */
function splitTin(raw: string | null | undefined): { tin: string; branch: string } {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length < 9) return { tin: d, branch: "" };
  const rest = d.slice(9);
  return { tin: d.slice(0, 9), branch: rest === "" ? "0000" : rest.slice(-4).padStart(4, "0") };
}

const q = (v: string) => `"${v}"`;
const mdy = (d: Date | null | undefined) => formatMdy(d ?? null) ?? "";

function cellReader(columns: typeof SCHEDULE_1_COLUMNS, row: (string | null)[]) {
  const at = new Map(columns.map((c, i) => [c.no, i]));
  return (no: string): string | null => {
    const i = at.get(no);
    if (i === undefined) throw new Error(`1604-C column ${no} does not exist`);
    return row[i] ?? null;
  };
}

function nameOf(e: Bir1604cEmployeeInput) {
  return `${e.lastName}, ${e.firstName}`;
}

/** Identity columns 1 to 12, the same on D1 and D2. */
function identity(
  kind: "D1" | "D2", agentTin: string, agentBranch: string, year: number, seq: number, emp: Bir1604cEmployeeInput,
  issues: DatIssue[], line: number,
): string[] {
  const { tin, branch } = splitTin(emp.person?.tin);
  const who = nameOf(emp);
  if (tin && (tin.length !== 9 || tin === "999999999" || tin === "111111111")) {
    issues.push({ severity: "error", line, column: 7, employee: who, message: `TIN ${emp.person?.tin} is not a valid 9-digit TIN.` });
  }
  if (!tin) issues.push({ severity: "warning", line, column: 7, employee: who, message: "No TIN on file: the TIN column is left empty." });
  const parts = [emp.lastName, [emp.firstName, emp.suffix].filter(Boolean).join(" "), emp.middleName ?? ""].map(datName);
  if (!parts[0]!.value && !parts[1]!.value) issues.push({ severity: "error", line, column: 9, employee: who, message: "The name is empty." });
  if (parts.some((p) => p.changed)) {
    issues.push({ severity: "warning", line, column: 9, employee: who, message: `Name written as ${parts.map((p) => p.value).filter(Boolean).join(" ")}: BIR's file allows plain letters only (no accents, " & ' , |).` });
  }
  const region = birRegionCode(emp.region);
  if (!region) issues.push({ severity: "error", line, column: 12, employee: who, message: "No region: set the region on the employee's profile before filing." });
  return [
    kind, "1604C", agentTin, agentBranch, `12/31/${year}`, `${seq}`, tin, tin ? branch : "",
    q(parts[0]!.value), q(parts[1]!.value), q(parts[2]!.value), region ?? "",
  ];
}

/** Columns that close every D line: nationality, status, reason, substituted filing. */
function tail(emp: Bir1604cEmployeeInput, substituted: string | null, issues: DatIssue[], line: number, first: number): string[] {
  const who = nameOf(emp);
  const nat = (emp.nationality ?? "").trim();
  const nationality = nat ? datName(nat).value : "FILIPINO";
  const status = (emp.employmentStatusCode ?? "R").toUpperCase();
  if (!STATUS_CODES.has(status)) issues.push({ severity: "error", line, column: first + 1, employee: who, message: `Employment status ${status} is not R, C, CP, S, P or AL.` });
  const reason = emp.separationReasonCode ? emp.separationReasonCode.toUpperCase() : "NA";
  if (reason !== "NA" && !REASON_CODES.has(reason)) issues.push({ severity: "error", line, column: first + 2, employee: who, message: `Reason of separation ${reason} is not T, TR, R or D.` });
  if (substituted === null) issues.push({ severity: "error", line, column: first + 3, employee: who, message: "Tax due is blank: no BIR withholding table is in force for the year." });
  return [nationality, status, reason, substituted === "Yes" ? "Y" : "N"];
}

const big = (v: string | null) => (v == null || v === "" ? 0n : BigInt(v));

/**
 * BIR's validator formulas for a Schedule 1 (D1) row, checked to the
 * centavo. `c` gives column N of the D line in centavos.
 */
function checkD1(c: (n: number) => bigint, issues: DatIssue[], line: number, who: string) {
  const fail = (column: number, message: string) => issues.push({ severity: "error", line, column, employee: who, message });
  const sum = (from: number, to: number) => { let t = 0n; for (let i = from; i <= to; i++) t += c(i); return t; };
  if (c(13) !== 0n && c(13) !== c(19) + c(23)) fail(13, "Previous employer gross (13) must equal 19 + 23.");
  if (c(19) !== sum(14, 18)) fail(19, "Previous employer total non-taxable (19) must equal 14 to 18.");
  if (c(23) !== sum(20, 22)) fail(23, "Previous employer total taxable (23) must equal 20 + 21 + 22.");
  if (c(15) > 9_000_000n) fail(15, "Previous employer non-taxable 13th month (15) is over 90,000.00.");
  if (c(26) !== c(32) + c(36)) fail(26, "Gross compensation (26) must equal 32 + 36.");
  if (c(32) !== sum(27, 31)) fail(32, "Total non-taxable (32) must equal 27 to 31.");
  if (c(36) !== sum(33, 35)) fail(36, "Total taxable (36) must equal 33 + 34 + 35.");
  if (c(37) !== c(23) + c(36)) fail(37, "Total taxable, previous and present (37) must equal 23 + 36.");
  if (c(38) !== c(37)) fail(38, "Net taxable (38) must equal 37.");
  if (c(42) !== 0n && c(42) !== c(39) - c(40) - c(41) - c(49)) fail(42, "December withholding (42) must equal 39 - 40 - 41 - 49.");
  const over = c(40) + c(41) + c(49) - c(39);
  if (over >= 0n && c(43) !== over) fail(43, "Over-withheld tax refunded (43) must equal 40 + 41 + 49 - 39.");
  if (c(44) !== c(39)) fail(44, "Tax withheld as adjusted (44) must equal tax due (39). Settle the year-end difference first.");
}

export function buildAlphalistDat(input: Bir1604cInput, built?: Bir1604cReport): AlphalistDat {
  const report = built ?? buildBir1604cReport(input);
  const { year } = input;
  const issues: DatIssue[] = [];
  const { tin: agentTin, branch: agentBranch } = splitTin(input.agent?.tin);
  if (agentTin.length !== 9) {
    issues.push({ severity: "error", line: 1, column: 2, message: "The company TIN is not set or not 9 digits. Add it in Settings, Company." });
  }
  const branch = agentBranch || "0000";

  const sched1 = report.form.schedules?.find((x) => x.title.startsWith("Schedule 1"));
  const sched2 = report.form.schedules?.find((x) => x.title.startsWith("Schedule 2"));
  const { schedule1, schedule2 } = alphalistScheduleEmployees(input);
  if ((sched1?.rows.length ?? 0) !== schedule1.length || (sched2?.rows.length ?? 0) !== schedule2.length) {
    throw new Error("1604-C rows and employees are out of step");
  }

  const lines: string[] = [`H1604C,${agentTin},${branch},12/31/${year}`];
  const d1Totals: bigint[] = Array(50).fill(0n);
  const d2Totals: bigint[] = Array(60).fill(0n);

  schedule1.forEach((emp, i) => {
    const r = cellReader(SCHEDULE_1_COLUMNS, sched1!.rows[i]!);
    const lineNo = lines.length + 1;
    const amounts: (string | null)[] = [
      r("12a"), "0", r("12b"), r("12c"), r("12d"), r("12e"), r("12f"), r("12g"), r("12h"), r("12i"), r("12j"),
    ];
    const present: (string | null)[] = [
      r("7a"), "0", r("7b"), r("7c"), r("7d"), r("7e"), r("7f"), r("7g"), r("7h"), r("7i"), r("7j"),
      r("13"), r("13"), r("14"), r("15a"), r("15b"), r("17a"), r("17b"), r("18"),
    ];
    const cents: Record<number, bigint> = {};
    amounts.forEach((v, k) => { cents[13 + k] = big(v); });
    present.forEach((v, k) => { cents[26 + k] = big(v); });
    cents[49] = big(r("16"));
    checkD1((n) => cents[n] ?? 0n, issues, lineNo, nameOf(emp));
    for (const [n, v] of Object.entries(cents)) d1Totals[Number(n)]! += v;
    lines.push([
      ...identity("D1", agentTin, branch, year, i + 1, emp, issues, lineNo),
      ...amounts.map(datAmount),
      mdy(emp.person?.periodFrom), mdy(emp.person?.periodTo),
      ...present.map(datAmount),
      ...tail(emp, r("19"), issues, lineNo, 45),
      datAmount(r("16")),
    ].join(","));
  });

  schedule2.forEach((emp, i) => {
    const r = cellReader(SCHEDULE_2_COLUMNS, sched2!.rows[i]!);
    const lineNo = lines.length + 1;
    const prev = ["12a", "12b", "12c", "12d", "12e", "12f", "12g", "12h", "12i", "12j", "12k", "12l", "12m", "12n"].map(r);
    const rates = [r("7a"), r("7b"), r("7c"), r("7d")];
    const rest = [
      ...["7g", "7h", "7i", "7j", "7k", "7l", "7m", "7n", "7o", "7p", "7q", "7r"].map(r),
      r("13"), r("13"), r("14"), r("15a"), r("15b"), r("17a"), r("17b"), r("18"),
    ];
    if (!r("7b")) issues.push({ severity: "error", line: lineNo, column: 30, employee: nameOf(emp), message: "Statutory minimum wage per day is required: set the region's minimum wage rule." });
    prev.forEach((v, k) => { d2Totals[13 + k]! += big(v); });
    rates.forEach((v, k) => { d2Totals[29 + k]! += big(v); });
    rest.forEach((v, k) => { d2Totals[34 + k]! += big(v); });
    const due = big(r("14"));
    // BIR's validator checks Schedule 2 characters only, so this is a warning.
    if (big(r("18")) !== due) issues.push({ severity: "warning", line: lineNo, column: 53, employee: nameOf(emp), message: "Tax withheld as adjusted (53) differs from tax due (48). Settle the year-end difference before filing." });
    lines.push([
      ...identity("D2", agentTin, branch, year, i + 1, emp, issues, lineNo),
      ...prev.map(datAmount),
      mdy(emp.person?.periodFrom), mdy(emp.person?.periodTo),
      ...rates.map(datAmount), r("7e") ?? "0",
      ...rest.map(datAmount),
      ...tail(emp, r("19"), issues, lineNo, 54),
      datAmount(r("16")),
      datAmount(r("7f")),
    ].join(","));
  });

  // Period of employment: both dates required, from not after to.
  [...schedule1, ...schedule2].forEach((emp, k) => {
    const from = emp.person?.periodFrom;
    const to = emp.person?.periodTo;
    const lineNo = k + 2;
    if (!from || !to) issues.push({ severity: "error", line: lineNo, column: 24, employee: nameOf(emp), message: "The period of employment needs both dates." });
    else if (from > to) issues.push({ severity: "error", line: lineNo, column: 24, employee: nameOf(emp), message: "The period of employment starts after it ends." });
  });

  const head = (kind: string) => [kind, "1604C", agentTin, branch, `12/31/${year}`];
  if (schedule1.length) {
    const cols = [...Array.from({ length: 11 }, (_, k) => 13 + k), ...Array.from({ length: 19 }, (_, k) => 26 + k)];
    lines.push([...head("C1"), ...cols.map((n) => datAmount(d1Totals[n]))].join(","));
  }
  if (schedule2.length) {
    const cols = [...Array.from({ length: 14 }, (_, k) => 13 + k), 29, 30, 31, 32, ...Array.from({ length: 20 }, (_, k) => 34 + k)];
    lines.push([...head("C2"), ...cols.map((n) => datAmount(d2Totals[n]))].join(","));
  }
  if (!schedule1.length && !schedule2.length) {
    issues.push({ severity: "error", line: 0, column: 0, message: `No finalized payroll in ${year}: the alphalist is empty.` });
  }

  return {
    fileName: `${agentTin || "000000000"}${branch}1231${year}1604C.DAT`,
    content: lines.map((l) => `${l}\r\n`).join(""),
    issues,
    valid: !issues.some((x) => x.severity === "error"),
  };
}
