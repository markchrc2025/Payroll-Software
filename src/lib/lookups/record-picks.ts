/**
 * Wave A4 (PAY-211): employee documents take their category from the
 * company's Document Categories, and training records their course and
 * trainer from Courses and Trainers.
 *
 * Document categories: the built-in ones keep the enum column `category`; a
 * category the company adds is stored as OTHER with its item. A category's
 * "Confidential by default" applies when the upload does not say, and "Has an
 * expiry date" makes the expiry date required.
 *
 * Courses: a training picked from a course takes the course's name, provider
 * and hours unless the form gives its own, and its expiry is the training
 * date plus the course's validity in months.
 */
import { DocumentCategory, type Prisma } from "@prisma/client";
import { listItems } from "@/lib/lookups/store";

type Tx = Prisma.TransactionClient;

export class PickRefusal extends Error {}

const ENUM_CATEGORIES = new Set<string>(Object.values(DocumentCategory));
const attrs = (j: Prisma.JsonValue) => (j && typeof j === "object" && !Array.isArray(j) ? j : {}) as Record<string, unknown>;

export async function resolveDocumentCategory(
  tx: Tx, tenantId: string,
  input: { category?: DocumentCategory; categoryId?: string; isConfidential?: boolean; expiresAt?: Date | null },
): Promise<{ category: DocumentCategory; categoryId: string | null; isConfidential: boolean; expiresAt: Date | null }> {
  const items = await listItems(tx, tenantId, "DOCUMENT_CATEGORY");
  const item = input.categoryId ? items.find((i) => i.id === input.categoryId) : items.find((i) => i.code === input.category);
  if (input.categoryId && !item) throw new PickRefusal("Pick a category from the company's Document Categories.");
  if (!item && !input.category) throw new PickRefusal("Choose the document category.");
  const a = item ? attrs(item.attributes) : {};
  const expiresAt = input.expiresAt ?? null;
  if (a.requiresExpiry === true && !expiresAt) throw new PickRefusal(`${item!.name} documents need an expiry date.`);
  return {
    category: item ? (ENUM_CATEGORIES.has(item.code) ? (item.code as DocumentCategory) : DocumentCategory.OTHER) : input.category!,
    categoryId: item?.id ?? null,
    isConfidential: input.isConfidential ?? a.isConfidentialByDefault === true,
    expiresAt,
  };
}

function addMonths(d: Date, months: number): Date {
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + months, day = d.getUTCDate();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, last)));
}

type TrainingFields = {
  courseId?: string | null; trainerId?: string | null;
  title?: string | null; provider?: string | null; hours?: number | null;
  trainingDate?: Date | null; expiresAt?: Date | null;
};

/** The training columns with the course's and trainer's picks applied. */
export async function applyCourse<T extends TrainingFields>(tx: Tx, tenantId: string, data: T): Promise<T & { title: string; courseId: string | null; trainerId: string | null }> {
  let { title, provider, hours, expiresAt } = data;
  let courseId: string | null = null;
  if (data.courseId) {
    const course = (await listItems(tx, tenantId, "COURSE")).find((c) => c.id === data.courseId);
    if (!course) throw new PickRefusal("Pick a course from the company's Courses.");
    const a = attrs(course.attributes);
    courseId = course.id;
    title ||= course.name;
    provider ??= typeof a.provider === "string" && a.provider ? a.provider : null;
    hours ??= typeof a.defaultHours === "number" ? Math.round(a.defaultHours) : null;
    const months = typeof a.certificateValidityMonths === "number" && a.certificateValidityMonths > 0 ? Math.round(a.certificateValidityMonths) : null;
    if (!expiresAt && months && data.trainingDate) expiresAt = addMonths(data.trainingDate, months);
  }
  let trainerId: string | null = null;
  if (data.trainerId) {
    const trainer = (await listItems(tx, tenantId, "TRAINER")).find((t) => t.id === data.trainerId);
    if (!trainer) throw new PickRefusal("Pick a trainer from the company's Trainers.");
    trainerId = trainer.id;
  }
  if (!title) throw new PickRefusal("Title is required");
  return { ...data, title, provider: provider ?? null, hours: hours ?? null, expiresAt: expiresAt ?? null, courseId, trainerId };
}
