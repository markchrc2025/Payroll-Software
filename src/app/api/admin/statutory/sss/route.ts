import type { NextRequest } from "next/server";
import { listStatutoryRules, createStatutoryRule } from "../_shared";

export const GET  = (req: NextRequest) => listStatutoryRules(req, "SSS_SCHEDULE");
export const POST = (req: NextRequest) => createStatutoryRule(req, "SSS_SCHEDULE");
