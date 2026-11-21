/** Wave C1 (PAY-213): the expense claims waiting for the signed-in approver. */
import { ApprovalInbox } from "@/components/approvals/ApprovalInbox";

export default function ExpenseReviewPage() {
  return (
    <ApprovalInbox
      module="EXPENSE"
      title="Expense Review"
      blurb="Submitted claims waiting for you, with the receipt, the category's limits and the tax treatment the type sets. Approved claims go to the next payroll run. Claims with something to look at are left out of Approve selected."
    />
  );
}
