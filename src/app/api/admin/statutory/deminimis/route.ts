import type { NextRequest } from "next/server";
import { listStatutoryRules, createStatutoryRule } from "../_shared";

export const GET  = (req: NextRequest) => listStatutoryRules(req, "DE_MINIMIS_CEILING");
export const POST = (req: NextRequest) => createStatutoryRule(req, "DE_MINIMIS_CEILING");
