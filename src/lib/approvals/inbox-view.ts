/**
 * Wave C0 (PAY-213): the shape of an inbox item, shared by the API
 * (src/lib/approvals/inbox.ts) and the review screens, and the routes each
 * module's approve and reject go through.
 */
export const INBOX_MODULES = ["LEAVE", "EXPENSE", "DOCUMENT"] as const;
export type InboxModule = (typeof INBOX_MODULES)[number];
export const isInboxModule = (m: string): m is InboxModule => (INBOX_MODULES as readonly string[]).includes(m);

export interface InboxItem {
  module: InboxModule;
  id: string;
  /** The approval step assigned to the caller, when they act as its approver. */
  stepId: string | null;
  /** STEP: the caller's own step; HR: approver by permission, no chain; HR_OVERRIDE: by permission over a chain. */
  via: "STEP" | "HR" | "HR_OVERRIDE";
  employee: { id: string; name: string; employeeNumber: string; department: string | null };
  title: string;
  date: string;
  endDate: string | null;
  amount: string;
  reason: string;
  filedAt: string;
  /** Anything the approver should look at; an item with any is left out of a bulk approval. */
  exceptions: string[];
  details: Record<string, unknown>;
}

/** The routes the inbox posts to; the module's own rules apply there. */
export const ACTION_ROUTES: Record<InboxModule, { approve: (id: string) => string; reject: (id: string) => string; returnTo?: (id: string) => string }> = {
  LEAVE: { approve: (id) => `/api/leave-transactions/${id}/approve`, reject: (id) => `/api/leave-transactions/${id}/reject` },
  EXPENSE: { approve: (id) => `/api/expense-claims/${id}/approve`, reject: (id) => `/api/expense-claims/${id}/reject`, returnTo: (id) => `/api/expense-claims/${id}/return` },
  DOCUMENT: { approve: (id) => `/api/document-requests/${id}/approve`, reject: (id) => `/api/document-requests/${id}/reject` },
};

/** Items a bulk approval may include: no exceptions. */
export const bulkApprovable = (items: InboxItem[]) => items.filter((i) => i.exceptions.length === 0);
