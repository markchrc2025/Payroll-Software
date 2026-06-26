-- AlterTable: "no negative pay" run-time floor toggle. In REGULAR/YEAR_END
-- runs the engine defers loan installments (carried in the loan balance) so net
-- pay never drops below zero. FINAL_PAY is exempt when this is true — terminal
-- charges against a separating employee's last pay may legitimately make it
-- negative. Set false to also floor FINAL_PAY.
ALTER TABLE "Tenant"
  ADD COLUMN "allowNegativeFinalPay" BOOLEAN NOT NULL DEFAULT true;
