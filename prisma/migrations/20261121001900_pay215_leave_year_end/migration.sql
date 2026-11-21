-- Wave E2 (PAY-215, decision 8): a policy for vacation leave, whose converted
-- days are de minimis up to 10 a year.
ALTER TABLE "LeaveEarningPolicy" ADD COLUMN "vacationLeave" BOOLEAN NOT NULL DEFAULT false;
