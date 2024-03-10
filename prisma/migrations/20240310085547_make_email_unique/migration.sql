/*
  Warnings:

  - A unique constraint covering the columns `[email]` on the table `GmailApiToken` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "GmailApiToken_email_key" ON "GmailApiToken"("email");
