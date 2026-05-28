import type { NextRequest } from "next/server";
import { patchStatutoryRule, deleteStatutoryRule } from "../../_shared";

export const PATCH  = (req: NextRequest, { params }: { params: Promise<{ id: string }> }) =>
  params.then(({ id }) => patchStatutoryRule(req, id, "DE_MINIMIS_CEILING"));

export const DELETE = (req: NextRequest, { params }: { params: Promise<{ id: string }> }) =>
  params.then(({ id }) => deleteStatutoryRule(req, id, "DE_MINIMIS_CEILING"));
