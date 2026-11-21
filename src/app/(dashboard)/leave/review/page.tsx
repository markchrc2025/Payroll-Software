/** Wave C2 (PAY-213): the leave requests waiting for the signed-in approver. */
import { ApprovalInbox } from "@/components/approvals/ApprovalInbox";

export default function LeaveReviewPage() {
  return (
    <ApprovalInbox
      module="LEAVE"
      title="Leave Review"
      blurb="Leave requests waiting for you, with the balance after approval and who else in the department is off on those dates. Requests with something to look at are left out of Approve selected."
    />
  );
}
