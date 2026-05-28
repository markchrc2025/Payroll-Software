import type { NextRequest } from "next/server";
import { listStatutoryRules, createStatutoryRule } from "../_shared";

export const GET  = (req: NextRequest) => listStatutoryRules(req, "MINIMUM_WAGE_RATE");
export const POST = (req: NextRequest) => createStatutoryRule(req, "MINIMUM_WAGE_RATE");
