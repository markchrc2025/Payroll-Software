import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/require-permission";
import { ok, err, serverError } from "@/lib/api-response";

/**
 * GET /api/holidays/ph-official?year=YYYY
 *
 * Fetches official Philippine public holidays from the Nager.Date public
 * holiday API (https://date.nager.at), maps them to our HolidayCategory, and
 * returns them ready to be inserted via POST /api/holidays.
 *
 * No API key required. This is a server-side proxy to avoid CORS and to keep
 * the external dependency out of the client bundle.
 */

// ---------------------------------------------------------------------------
// Category mapping
// Names match the Nager.Date "name" field for PH holidays.
// Anything not in SPECIAL_NAMES defaults to LEGAL (regular holiday, 200%).
// ---------------------------------------------------------------------------

const SPECIAL_NON_WORKING = new Set([
  "chinese new year",
  "holy saturday",
  "ninoy aquino day",
  "all saints' day eve",
  "all saints' day",
  "all souls' day",
  "feast of the immaculate conception of mary",
  "feast of the immaculate conception",
  "christmas eve",
  "last day of the year",
  "new year's eve",
]);

// Eid holidays are Legal (regular) when proclaimed but marked tentative
// because the exact date depends on the lunar calendar.
const EID_NAMES = new Set(["eid al-fitr", "eid al-adha", "eid'l fitr", "eid'l adha"]);

interface NagerHoliday {
  date: string;       // "YYYY-MM-DD"
  name: string;       // English name
  localName: string;
  fixed: boolean;
  global: boolean;
  types: string[];
}

function mapCategory(name: string): "LEGAL" | "SPECIAL_NON_WORKING" {
  const lower = name.toLowerCase();
  if (SPECIAL_NON_WORKING.has(lower)) return "SPECIAL_NON_WORKING";
  return "LEGAL";
}

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "SETTINGS", "READ");
  if (guard instanceof Response) return guard;

  const year = req.nextUrl.searchParams.get("year") ?? String(new Date().getFullYear());
  const yearNum = Number(year);
  if (!yearNum || yearNum < 2020 || yearNum > 2099) {
    return err("year must be between 2020 and 2099");
  }

  try {
    const res = await fetch(
      `https://date.nager.at/api/v3/PublicHolidays/${year}/PH`,
      {
        headers: { Accept: "application/json" },
        // Revalidate at most once per day — proclamations don't change hourly
        next: { revalidate: 86400 },
      }
    );

    if (!res.ok) {
      return serverError(`Nager.Date returned HTTP ${res.status}`);
    }

    const raw: NagerHoliday[] = await res.json();

    const holidays = raw.map((h) => {
      const isEid = EID_NAMES.has(h.name.toLowerCase());
      return {
        name: h.name,
        localName: h.localName,
        category: mapCategory(h.name),
        date: h.date,
        recurringAnnually: h.fixed,
        scope: "COMPANY_WIDE" as const,
        branchIds: [],
        region: null,
        provinceCity: null,
        proclamationReference: null,
        notes: null,
        isTentative: isEid, // Eid dates depend on lunar proclamation
      };
    });

    return ok(holidays);
  } catch (e) {
    console.error("[ph-official] fetch error", e);
    return serverError("Could not reach holiday data source");
  }
}
