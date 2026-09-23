-- CreateEnum
CREATE TYPE "AchievementBranch" AS ENUM ('GOURMET', 'EXPLORER');

-- CreateEnum
CREATE TYPE "AchievementStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "JournalType" AS ENUM ('FOOD_CHECK_IN', 'GEO_SERENDIPITY', 'EXPLORATION_ROUTE', 'AI_STORY');

-- CreateEnum
CREATE TYPE "FoodRecognitionStatus" AS ENUM ('PENDING', 'ANALYZED', 'FAILED');

-- CreateEnum
CREATE TYPE "GeoQuestStatus" AS ENUM ('TRIGGERED', 'ACCEPTED', 'COMPLETED', 'EXPIRED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "username" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "level" INTEGER NOT NULL DEFAULT 1,
    "exp" INTEGER NOT NULL DEFAULT 0,
    "vitality" INTEGER NOT NULL DEFAULT 0,
    "exploration" INTEGER NOT NULL DEFAULT 0,
    "happiness" INTEGER NOT NULL DEFAULT 0,
    "flavorExperience" INTEGER NOT NULL DEFAULT 0,
    "nutrition" INTEGER NOT NULL DEFAULT 0,
    "curiosity" INTEGER NOT NULL DEFAULT 0,
    "baseSerendipity" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
    "currentSerendipity" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
    "digestiveDebuffImmune" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Achievement" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "branch" "AchievementBranch" NOT NULL,
    "description" TEXT NOT NULL,
    "condition" JSONB NOT NULL,
    "buff" JSONB NOT NULL,
    "status" "AchievementStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Achievement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAchievement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "buffActive" BOOLEAN NOT NULL DEFAULT true,
    "buffState" JSONB,

    CONSTRAINT "UserAchievement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdventureJournal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "JournalType" NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "storyText" TEXT,
    "foodRecognitionStatus" "FoodRecognitionStatus",
    "foodName" TEXT,
    "cuisine" TEXT,
    "spices" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "imageUrl" TEXT,
    "geoQuestStatus" "GeoQuestStatus",
    "locationName" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "routePlan" JSONB,
    "expDelta" INTEGER NOT NULL DEFAULT 0,
    "vitalityDelta" INTEGER NOT NULL DEFAULT 0,
    "explorationDelta" INTEGER NOT NULL DEFAULT 0,
    "happinessDelta" INTEGER NOT NULL DEFAULT 0,
    "flavorExperienceDelta" INTEGER NOT NULL DEFAULT 0,
    "nutritionDelta" INTEGER NOT NULL DEFAULT 0,
    "curiosityDelta" INTEGER NOT NULL DEFAULT 0,
    "serendipityDelta" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdventureJournal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_username_idx" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Achievement_code_key" ON "Achievement"("code");

-- CreateIndex
CREATE INDEX "Achievement_branch_idx" ON "Achievement"("branch");

-- CreateIndex
CREATE INDEX "UserAchievement_achievementId_idx" ON "UserAchievement"("achievementId");

-- CreateIndex
CREATE UNIQUE INDEX "UserAchievement_userId_achievementId_key" ON "UserAchievement"("userId", "achievementId");

-- CreateIndex
CREATE INDEX "AdventureJournal_userId_createdAt_idx" ON "AdventureJournal"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AdventureJournal_type_idx" ON "AdventureJournal"("type");

-- AddForeignKey
ALTER TABLE "UserAchievement" ADD CONSTRAINT "UserAchievement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAchievement" ADD CONSTRAINT "UserAchievement_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "Achievement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdventureJournal" ADD CONSTRAINT "AdventureJournal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
