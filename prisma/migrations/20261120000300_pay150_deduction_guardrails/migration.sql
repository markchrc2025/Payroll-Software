-- PAY-150 (Mark, 16 Nov 2026): Other Deductions need the employee's written
-- authorization (Labor Code Art. 113); a loss or damage deduction also needs
-- an incident record and the actual loss (Art. 114, 115).
ALTER TABLE "EmployeePayComponent" ADD COLUMN "authorizationDate" TIMESTAMP(3);
ALTER TABLE "EmployeePayComponent" ADD COLUMN "authorizationFileKey" TEXT;
ALTER TABLE "EmployeePayComponent" ADD COLUMN "incidentReportId" TEXT;
ALTER TABLE "EmployeePayComponent" ADD COLUMN "actualLossCents" BIGINT;
