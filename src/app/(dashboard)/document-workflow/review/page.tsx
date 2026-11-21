/** Wave C4 (PAY-213): the document requests waiting for the signed-in approver, with a preview. */
import { ApprovalInbox } from "@/components/approvals/ApprovalInbox";

export default function DocumentReviewPage() {
  return (
    <ApprovalInbox
      module="DOCUMENT"
      title="Document Review"
      blurb="Document requests waiting for you, with a preview of the letter as it will be issued. Approving issues it; the employee downloads it in ESS. A letter that shows pay is previewed and approved only by a role that may see pay."
    />
  );
}
