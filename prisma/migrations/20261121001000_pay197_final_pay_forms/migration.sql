-- PAY-197 part 3: when HR issued the certificate of employment.
ALTER TABLE "OffboardingCase" ADD COLUMN "coeIssuedAt" TIMESTAMP(3);
