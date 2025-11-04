-- AlterTable
-- NOTE: Ensure JudgeImage has been cleaned (e.g. via prisma migrate reset) before applying.
ALTER TABLE "JudgeImage"
ADD COLUMN     "userId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "JudgeImage_userId_analysisId_idx" ON "JudgeImage"("userId", "analysisId");
