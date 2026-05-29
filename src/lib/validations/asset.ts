/**
 * Zod validation schemas for Asset management (Phase X).
 */
import { z } from "zod";
import { AssetStatus, AssetCondition } from "@prisma/client";

const cuid = z.string().min(1);

export const createAssetSchema = z.object({
  assetCode: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional().nullable(),
  category: z.string().min(1).max(100),
  serialNumber: z.string().max(100).optional().nullable(),
  model: z.string().max(100).optional().nullable(),
  brand: z.string().max(100).optional().nullable(),
  purchaseDate: z.coerce.date().optional().nullable(),
  /// Purchase cost as a decimal peso string (e.g. "45000.00") — converted to centavos server-side.
  purchaseCost: z.string().regex(/^\d+(\.\d+)?$/).optional().nullable(),
  status: z.nativeEnum(AssetStatus).optional(),
  condition: z.nativeEnum(AssetCondition).optional(),
  notes: z.string().max(2000).optional().nullable(),
});

export type CreateAssetInput = z.infer<typeof createAssetSchema>;

export const updateAssetSchema = createAssetSchema.partial();

export type UpdateAssetInput = z.infer<typeof updateAssetSchema>;

export const assignAssetSchema = z.object({
  employeeId: cuid,
  conditionAtAssign: z.nativeEnum(AssetCondition).optional(),
  assignmentNotes: z.string().max(1000).optional().nullable(),
});

export type AssignAssetInput = z.infer<typeof assignAssetSchema>;

export const returnAssetSchema = z.object({
  conditionAtReturn: z.nativeEnum(AssetCondition).optional(),
  returnNotes: z.string().max(1000).optional().nullable(),
});

export type ReturnAssetInput = z.infer<typeof returnAssetSchema>;

export const listAssetsSchema = z.object({
  status: z.nativeEnum(AssetStatus).optional(),
  category: z.string().optional(),
  employeeId: cuid.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
