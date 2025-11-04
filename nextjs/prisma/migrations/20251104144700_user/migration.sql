-- DropIndex
DROP INDEX "public"."JudgeImage_userId_analysisId_idx";

-- CreateIndex
CREATE INDEX "JudgeImage_userId_analysisId_maskImageUrl_idx" ON "JudgeImage"("userId", "analysisId", "maskImageUrl");
