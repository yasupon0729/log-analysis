-- CreateTable
CREATE TABLE "JudgeImage" (
    "id" TEXT NOT NULL,
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
