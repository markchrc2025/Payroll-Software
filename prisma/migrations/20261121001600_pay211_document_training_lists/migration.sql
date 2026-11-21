-- Wave A4 (PAY-211): employee documents take their category from the
-- company's list (with an expiry date where the category needs one); training
-- records take their course and trainer from the lists.
ALTER TABLE "EmployeeDocument" ADD COLUMN "categoryId" TEXT;
ALTER TABLE "EmployeeDocument" ADD COLUMN "expiresAt" TIMESTAMP(3);
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "LookupItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmployeeTraining" ADD COLUMN "courseId" TEXT;
ALTER TABLE "EmployeeTraining" ADD COLUMN "trainerId" TEXT;
ALTER TABLE "EmployeeTraining" ADD CONSTRAINT "EmployeeTraining_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "LookupItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmployeeTraining" ADD CONSTRAINT "EmployeeTraining_trainerId_fkey"
  FOREIGN KEY ("trainerId") REFERENCES "LookupItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
