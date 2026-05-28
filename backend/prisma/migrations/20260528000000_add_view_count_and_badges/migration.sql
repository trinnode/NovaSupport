-- AlterTable: add viewCount to Profile
ALTER TABLE "Profile" ADD COLUMN "viewCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable: Badge
CREATE TABLE "Badge" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "criteria" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Badge_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ProfileBadge
CREATE TABLE "ProfileBadge" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileBadge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Badge_name_key" ON "Badge"("name");

-- CreateIndex
CREATE INDEX "ProfileBadge_profileId_idx" ON "ProfileBadge"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "ProfileBadge_profileId_badgeId_key" ON "ProfileBadge"("profileId", "badgeId");

-- AddForeignKey
ALTER TABLE "ProfileBadge" ADD CONSTRAINT "ProfileBadge_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileBadge" ADD CONSTRAINT "ProfileBadge_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "Badge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
