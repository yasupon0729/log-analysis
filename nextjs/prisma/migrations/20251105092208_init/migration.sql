-- CreateTable
CREATE TABLE "JudgeImage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "analysisId" TEXT NOT NULL,
    "originalImageUrl" TEXT NOT NULL,
    "maskImageUrl" TEXT NOT NULL,
    "isExcel" BOOLEAN NOT NULL DEFAULT false,
    "point" INTEGER,
    "note" TEXT,

    CONSTRAINT "JudgeImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JudgeImage_userId_analysisId_idx" ON "JudgeImage"("userId", "analysisId");

-- CreateIndex
CREATE UNIQUE INDEX "JudgeImage_userId_analysisId_originalImageUrl_key" ON "JudgeImage"("userId", "analysisId", "originalImageUrl");
