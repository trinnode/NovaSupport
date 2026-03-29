-- AlterTable
ALTER TABLE "Profile" ADD COLUMN "email" TEXT;
ALTER TABLE "Profile" ADD COLUMN "websiteUrl" TEXT;
ALTER TABLE "Profile" ADD COLUMN "twitterHandle" TEXT;
ALTER TABLE "Profile" ADD COLUMN "githubHandle" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Profile_email_key" ON "Profile"("email");
