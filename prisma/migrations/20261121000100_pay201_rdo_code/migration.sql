-- PAY-201: BIR RDO Code for the withholding agent and for each employee.
ALTER TABLE "Tenant" ADD COLUMN "rdoCode" TEXT;
ALTER TABLE "Employee" ADD COLUMN "rdoCode" TEXT;
