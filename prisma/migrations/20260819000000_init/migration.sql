-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('FREELANCER', 'RECRUITER', 'ADMIN');

-- CreateEnum
CREATE TYPE "FreelancerVerification" AS ENUM ('NONE', 'ID_VERIFIED', 'ID_AND_WORK_VERIFIED');

-- CreateEnum
CREATE TYPE "RecruiterTier" AS ENUM ('UNVERIFIED', 'VERIFIED', 'TRUSTED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'CLOSED', 'REMOVED');

-- CreateEnum
CREATE TYPE "EngagementType" AS ENUM ('HOURLY', 'FIXED', 'PART_TIME', 'FULL_TIME');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('SUBMITTED', 'VIEWED', 'SHORTLISTED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('FREE', 'FREELANCER_PRO', 'RECRUITER_GROWTH', 'RECRUITER_TEAM');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELED', 'TRIALING');

-- CreateEnum
CREATE TYPE "FlagReason" AS ENUM ('UPFRONT_PAYMENT', 'LONG_UNPAID_TEST', 'OFF_PLATFORM_PAYMENT', 'SUSPECTED_SCAM', 'SPAM', 'OTHER');

-- CreateEnum
CREATE TYPE "FlagStatus" AS ENUM ('OPEN', 'CLEARED', 'UPHELD');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "billingCountry" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FreelancerProfile" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "userRole" "UserRole" NOT NULL DEFAULT 'FREELANCER',
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "bio" TEXT NOT NULL,
    "hourlyRateUsd" INTEGER,
    "country" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "verification" "FreelancerVerification" NOT NULL DEFAULT 'NONE',
    "githubUrl" TEXT,
    "portfolioUrl" TEXT,
    "linkedinUrl" TEXT,
    "isOpenToWork" BOOLEAN NOT NULL DEFAULT true,
    "searchBoost" BOOLEAN NOT NULL DEFAULT false,
    -- Maintained by Postgres, never by application code, so it cannot drift
    -- from headline/bio. Prisma models this as Unsupported("tsvector") and does
    -- not track column generation expressions, so it survives future migrations.
    -- headline is weighted above bio.
    "searchVector" tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce("headline", '')), 'A') ||
        setweight(to_tsvector('english', coalesce("bio", '')), 'B')
    ) STORED,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FreelancerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecruiterProfile" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "userRole" "UserRole" NOT NULL DEFAULT 'RECRUITER',
    "slug" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "companyDomain" TEXT,
    "registrationNo" TEXT,
    "linkedinUrl" TEXT,
    "websiteUrl" TEXT,
    "logoUrl" TEXT,
    "description" TEXT,
    "country" TEXT NOT NULL,
    "tier" "RecruiterTier" NOT NULL DEFAULT 'UNVERIFIED',
    "verifiedAt" TIMESTAMP(3),
    "isBanned" BOOLEAN NOT NULL DEFAULT false,
    "bannedReason" TEXT,
    "bannedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecruiterProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "recruiterId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "engagementType" "EngagementType" NOT NULL,
    "budgetMinUsd" INTEGER,
    "budgetMaxUsd" INTEGER,
    "isRemote" BOOLEAN NOT NULL DEFAULT true,
    "location" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "closedAt" TIMESTAMP(3),
    "recruiterTier" "RecruiterTier" NOT NULL DEFAULT 'UNVERIFIED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillOnJob" (
    "jobId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,

    CONSTRAINT "SkillOnJob_pkey" PRIMARY KEY ("jobId","skillId")
);

-- CreateTable
CREATE TABLE "SkillOnFreelancer" (
    "freelancerId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "yearsExp" INTEGER,

    CONSTRAINT "SkillOnFreelancer_pkey" PRIMARY KEY ("freelancerId","skillId")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "freelancerId" TEXT NOT NULL,
    "coverLetter" TEXT NOT NULL,
    "proposedRateUsd" INTEGER,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "viewedAt" TIMESTAMP(3),
    "recruiterNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "plan" "PlanTier" NOT NULL DEFAULT 'FREE',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "priceRegion" TEXT,
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Engagement" (
    "id" TEXT NOT NULL,
    "jobId" TEXT,
    "freelancerId" TEXT NOT NULL,
    "recruiterId" TEXT NOT NULL,
    "statedRateUsd" INTEGER,
    "durationWeeks" INTEGER,
    "freelancerConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "recruiterConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "isConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Engagement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "engagementId" TEXT NOT NULL,
    "engagementIsConfirmed" BOOLEAN NOT NULL DEFAULT true,
    "id" TEXT NOT NULL,
    "authorFreelancerId" TEXT,
    "authorRecruiterId" TEXT,
    "subjectFreelancerId" TEXT,
    "subjectRecruiterId" TEXT,
    "rating" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyFlag" (
    "id" TEXT NOT NULL,
    "jobId" TEXT,
    "messageId" TEXT,
    "reason" "FlagReason" NOT NULL,
    "status" "FlagStatus" NOT NULL DEFAULT 'OPEN',
    "isAutomated" BOOLEAN NOT NULL DEFAULT true,
    "matchedTerm" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SafetyFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "reportedById" UUID NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" "FlagStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "jobId" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationParticipant" (
    "conversationId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "lastReadAt" TIMESTAMP(3),
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationParticipant_pkey" PRIMARY KEY ("conversationId","userId")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "isFlagged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_id_role_key" ON "User"("id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "FreelancerProfile_userId_key" ON "FreelancerProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FreelancerProfile_slug_key" ON "FreelancerProfile"("slug");

-- CreateIndex
CREATE INDEX "FreelancerProfile_isOpenToWork_country_idx" ON "FreelancerProfile"("isOpenToWork", "country");

-- CreateIndex
CREATE INDEX "FreelancerProfile_searchVector_idx" ON "FreelancerProfile" USING GIN ("searchVector");

-- CreateIndex
CREATE UNIQUE INDEX "FreelancerProfile_userId_userRole_key" ON "FreelancerProfile"("userId", "userRole");

-- CreateIndex
CREATE UNIQUE INDEX "RecruiterProfile_userId_key" ON "RecruiterProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RecruiterProfile_slug_key" ON "RecruiterProfile"("slug");

-- CreateIndex
CREATE INDEX "RecruiterProfile_tier_isBanned_idx" ON "RecruiterProfile"("tier", "isBanned");

-- CreateIndex
CREATE UNIQUE INDEX "RecruiterProfile_userId_userRole_key" ON "RecruiterProfile"("userId", "userRole");

-- CreateIndex
CREATE UNIQUE INDEX "Job_slug_key" ON "Job"("slug");

-- CreateIndex
CREATE INDEX "Job_status_publishedAt_id_idx" ON "Job"("status", "publishedAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Job_status_categoryId_publishedAt_idx" ON "Job"("status", "categoryId", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "Job_recruiterId_status_idx" ON "Job"("recruiterId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_slug_key" ON "Skill"("slug");

-- CreateIndex
CREATE INDEX "Skill_categoryId_idx" ON "Skill"("categoryId");

-- CreateIndex
CREATE INDEX "SkillOnJob_skillId_idx" ON "SkillOnJob"("skillId");

-- CreateIndex
CREATE INDEX "SkillOnFreelancer_skillId_idx" ON "SkillOnFreelancer"("skillId");

-- CreateIndex
CREATE INDEX "Application_freelancerId_createdAt_idx" ON "Application"("freelancerId", "createdAt");

-- CreateIndex
CREATE INDEX "Application_jobId_status_idx" ON "Application"("jobId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Application_jobId_freelancerId_key" ON "Application"("jobId", "freelancerId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeCustomerId_key" ON "Subscription"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "Engagement_freelancerId_confirmedAt_idx" ON "Engagement"("freelancerId", "confirmedAt");

-- CreateIndex
CREATE INDEX "Engagement_recruiterId_confirmedAt_idx" ON "Engagement"("recruiterId", "confirmedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Engagement_id_isConfirmed_key" ON "Engagement"("id", "isConfirmed");

-- CreateIndex
CREATE UNIQUE INDEX "Engagement_recruiterId_freelancerId_jobId_key" ON "Engagement"("recruiterId", "freelancerId", "jobId");

-- CreateIndex
CREATE INDEX "Review_engagementId_idx" ON "Review"("engagementId");

-- CreateIndex
CREATE INDEX "Review_subjectFreelancerId_createdAt_idx" ON "Review"("subjectFreelancerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Review_subjectRecruiterId_createdAt_idx" ON "Review"("subjectRecruiterId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Review_engagementId_authorFreelancerId_key" ON "Review"("engagementId", "authorFreelancerId");

-- CreateIndex
CREATE UNIQUE INDEX "Review_engagementId_authorRecruiterId_key" ON "Review"("engagementId", "authorRecruiterId");

-- CreateIndex
CREATE INDEX "SafetyFlag_status_createdAt_idx" ON "SafetyFlag"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SafetyFlag_jobId_idx" ON "SafetyFlag"("jobId");

-- CreateIndex
CREATE INDEX "SafetyFlag_messageId_idx" ON "SafetyFlag"("messageId");

-- CreateIndex
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Report_reportedById_idx" ON "Report"("reportedById");

-- CreateIndex
CREATE INDEX "Report_targetType_targetId_idx" ON "Report"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "Conversation_jobId_idx" ON "Conversation"("jobId");

-- CreateIndex
CREATE INDEX "ConversationParticipant_userId_isArchived_lastMessageAt_idx" ON "ConversationParticipant"("userId", "isArchived", "lastMessageAt" DESC);

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_senderId_idx" ON "Message"("senderId");

-- AddForeignKey
ALTER TABLE "FreelancerProfile" ADD CONSTRAINT "FreelancerProfile_userId_userRole_fkey" FOREIGN KEY ("userId", "userRole") REFERENCES "User"("id", "role") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RecruiterProfile" ADD CONSTRAINT "RecruiterProfile_userId_userRole_fkey" FOREIGN KEY ("userId", "userRole") REFERENCES "User"("id", "role") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_recruiterId_fkey" FOREIGN KEY ("recruiterId") REFERENCES "RecruiterProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillOnJob" ADD CONSTRAINT "SkillOnJob_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillOnJob" ADD CONSTRAINT "SkillOnJob_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillOnFreelancer" ADD CONSTRAINT "SkillOnFreelancer_freelancerId_fkey" FOREIGN KEY ("freelancerId") REFERENCES "FreelancerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillOnFreelancer" ADD CONSTRAINT "SkillOnFreelancer_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_freelancerId_fkey" FOREIGN KEY ("freelancerId") REFERENCES "FreelancerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Engagement" ADD CONSTRAINT "Engagement_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Engagement" ADD CONSTRAINT "Engagement_freelancerId_fkey" FOREIGN KEY ("freelancerId") REFERENCES "FreelancerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Engagement" ADD CONSTRAINT "Engagement_recruiterId_fkey" FOREIGN KEY ("recruiterId") REFERENCES "RecruiterProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_engagementId_engagementIsConfirmed_fkey" FOREIGN KEY ("engagementId", "engagementIsConfirmed") REFERENCES "Engagement"("id", "isConfirmed") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_authorFreelancerId_fkey" FOREIGN KEY ("authorFreelancerId") REFERENCES "FreelancerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_authorRecruiterId_fkey" FOREIGN KEY ("authorRecruiterId") REFERENCES "RecruiterProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_subjectFreelancerId_fkey" FOREIGN KEY ("subjectFreelancerId") REFERENCES "FreelancerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_subjectRecruiterId_fkey" FOREIGN KEY ("subjectRecruiterId") REFERENCES "RecruiterProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyFlag" ADD CONSTRAINT "SafetyFlag_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyFlag" ADD CONSTRAINT "SafetyFlag_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ═══════════════════════════════════════════════════════════════════════════
-- Constraints Prisma cannot express.
--
-- Prisma's differ does not model CHECK constraints, triggers, or column
-- generation expressions, so everything below survives future `migrate dev`
-- runs without being dropped or re-emitted.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Role integrity ─────────────────────────────────────────────────────────
-- Each profile carries a pinned role column that is half of a composite FK to
-- User(id, role). The CHECK pins it to one value, so a FREELANCER user cannot
-- own a RecruiterProfile. The FK's ON UPDATE RESTRICT additionally makes
-- User.role immutable for as long as a profile exists.
ALTER TABLE "FreelancerProfile"
  ADD CONSTRAINT "freelancer_profile_role_pinned"
  CHECK ("userRole" = 'FREELANCER');

ALTER TABLE "RecruiterProfile"
  ADD CONSTRAINT "recruiter_profile_role_pinned"
  CHECK ("userRole" = 'RECRUITER');

ALTER TABLE "FreelancerProfile"
  ADD CONSTRAINT "freelancer_rate_positive"
  CHECK ("hourlyRateUsd" IS NULL OR "hourlyRateUsd" > 0);

-- ── Job publication integrity ──────────────────────────────────────────────
-- An ACTIVE job with a NULL publishedAt is invisible to every browse query
-- forever, and fails silently rather than loudly. Forbid the state.
ALTER TABLE "Job"
  ADD CONSTRAINT "job_active_requires_published_at"
  CHECK ("status" <> 'ACTIVE' OR "publishedAt" IS NOT NULL);

ALTER TABLE "Job"
  ADD CONSTRAINT "job_budget_range_ordered"
  CHECK ("budgetMinUsd" IS NULL OR "budgetMaxUsd" IS NULL OR "budgetMinUsd" <= "budgetMaxUsd");

ALTER TABLE "Job"
  ADD CONSTRAINT "job_budget_non_negative"
  CHECK (("budgetMinUsd" IS NULL OR "budgetMinUsd" >= 0) AND ("budgetMaxUsd" IS NULL OR "budgetMaxUsd" >= 0));

-- On-site work must say where.
ALTER TABLE "Job"
  ADD CONSTRAINT "job_onsite_requires_location"
  CHECK ("isRemote" OR "location" IS NOT NULL);

-- ── Engagement confirmation integrity ──────────────────────────────────────
-- confirmedAt and isConfirmed are both derived from the two party booleans.
-- The trigger derives them so no caller can forget; the CHECK then guarantees
-- the derivation holds even if the trigger is ever dropped.
CREATE OR REPLACE FUNCTION "engagement_sync_confirmation"() RETURNS trigger AS $$
BEGIN
  NEW."isConfirmed" := NEW."freelancerConfirmed" AND NEW."recruiterConfirmed";
  IF NEW."isConfirmed" THEN
    NEW."confirmedAt" := COALESCE(NEW."confirmedAt", now());
  ELSE
    NEW."confirmedAt" := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "engagement_sync_confirmation_trg"
  BEFORE INSERT OR UPDATE ON "Engagement"
  FOR EACH ROW EXECUTE FUNCTION "engagement_sync_confirmation"();

ALTER TABLE "Engagement"
  ADD CONSTRAINT "engagement_confirmation_derived"
  CHECK (
    "isConfirmed" = ("freelancerConfirmed" AND "recruiterConfirmed")
    AND ("confirmedAt" IS NOT NULL) = "isConfirmed"
  );

ALTER TABLE "Engagement"
  ADD CONSTRAINT "engagement_rate_positive"
  CHECK ("statedRateUsd" IS NULL OR "statedRateUsd" > 0);

ALTER TABLE "Engagement"
  ADD CONSTRAINT "engagement_duration_positive"
  CHECK ("durationWeeks" IS NULL OR "durationWeeks" > 0);

-- ── Review integrity ───────────────────────────────────────────────────────
-- This is the constraint that makes "reviews are locked until both parties
-- confirm" true at the database rather than in a comment. Review's composite FK
-- points at Engagement(id, isConfirmed); pinning engagementIsConfirmed to true
-- means a review against an unconfirmed engagement has no FK target and the
-- insert fails, from any client, including psql.
ALTER TABLE "Review"
  ADD CONSTRAINT "review_requires_confirmed_engagement"
  CHECK ("engagementIsConfirmed" = true);

ALTER TABLE "Review"
  ADD CONSTRAINT "review_rating_range"
  CHECK ("rating" BETWEEN 1 AND 5);

-- Exactly one author, and exactly one subject. Without these a review can have
-- no author at all (anonymous) or two.
ALTER TABLE "Review"
  ADD CONSTRAINT "review_exactly_one_author"
  CHECK (num_nonnulls("authorFreelancerId", "authorRecruiterId") = 1);

ALTER TABLE "Review"
  ADD CONSTRAINT "review_exactly_one_subject"
  CHECK (num_nonnulls("subjectFreelancerId", "subjectRecruiterId") = 1);

-- A freelancer reviews the recruiter, and a recruiter reviews the freelancer.
-- Nobody reviews their own side.
ALTER TABLE "Review"
  ADD CONSTRAINT "review_author_and_subject_are_opposite_sides"
  CHECK (("authorFreelancerId" IS NOT NULL) = ("subjectRecruiterId" IS NOT NULL));

-- ── Application integrity ──────────────────────────────────────────────────
ALTER TABLE "Application"
  ADD CONSTRAINT "application_proposed_rate_positive"
  CHECK ("proposedRateUsd" IS NULL OR "proposedRateUsd" > 0);
