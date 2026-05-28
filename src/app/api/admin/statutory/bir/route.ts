import type { NextRequest } from "next/server";
import { listStatutoryRules, createStatutoryRule } from "../_shared";

export const GET  = (req: NextRequest) => listStatutoryRules(req, "BIR_WITHHOLDING_TABLE");
export const POST = (req: NextRequest) => createStatutoryRule(req, "BIR_WITHHOLDING_TABLE");
