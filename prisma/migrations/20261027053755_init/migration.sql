-- CreateEnum
CREATE TYPE "ContentCategory" AS ENUM ('PROGRAM', 'MOVIE', 'NEWS', 'LIVE', 'SPECIAL_EVENT', 'ADVERTISEMENT', 'PROMO', 'FILLER', 'SLIDE', 'STATION_ID', 'PSA');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ApprovalState" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('AVAILABLE', 'MISSING');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AiringStatus" AS ENUM ('PLANNED', 'AIRED', 'MISSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ScheduleItemKind" AS ENUM ('CONTENT', 'BREAK');

-- CreateEnum
CREATE TYPE "TimingMode" AS ENUM ('SEQUENTIAL', 'FIXED');

-- CreateEnum
CREATE TYPE "RuleType" AS ENUM ('NO_DUPLICATE_CONTENT', 'RATING_TIME_WINDOW', 'CATEGORY_TIME_WINDOW', 'CATEGORY_REQUIRES_APPROVAL', 'SCHEDULE_END_DEADLINE', 'MAX_GAP');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('ERROR', 'WARNING');

-- CreateEnum
CREATE TYPE "ApprovalRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "DecisionType" AS ENUM ('APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lockedUntil" TIMESTAMPTZ(3),
    "lastLoginAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "ip" TEXT,
    "success" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL,
    "broadcastDayStartMinute" INTEGER NOT NULL DEFAULT 360,
    "defaultGapMs" INTEGER NOT NULL DEFAULT 0,
    "underrunToleranceMs" INTEGER NOT NULL DEFAULT 60000,
    "playoutSystem" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "durationMs" INTEGER,
    "status" "AssetStatus" NOT NULL DEFAULT 'AVAILABLE',
    "uploadedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentItem" (
    "id" TEXT NOT NULL,
    "houseNumber" TEXT,
    "title" TEXT NOT NULL,
    "category" "ContentCategory" NOT NULL,
    "description" TEXT,
    "assetId" TEXT,
    "originalDurationMs" INTEGER,
    "plannedDurationMs" INTEGER NOT NULL,
    "isDurationEditable" BOOLEAN NOT NULL DEFAULT true,
    "status" "ContentStatus" NOT NULL DEFAULT 'ACTIVE',
    "approvalState" "ApprovalState" NOT NULL DEFAULT 'APPROVED',
    "language" TEXT,
    "rating" TEXT,
    "rightsHolder" TEXT,
    "licenseNotes" TEXT,
    "maxAiringsPerDay" INTEGER,
    "availableFrom" TIMESTAMPTZ(3),
    "availableUntil" TIMESTAMPTZ(3),
    "allowedStartMinute" INTEGER,
    "allowedEndMinute" INTEGER,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ContentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentChannel" (
    "contentItemId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,

    CONSTRAINT "ContentChannel_pkey" PRIMARY KEY ("contentItemId","channelId")
);

-- CreateTable
CREATE TABLE "Advertiser" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Advertiser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdvertisingCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "advertiserId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 5,
    "maxAirings" INTEGER,
    "contractedAirings" INTEGER,
    "dailyLimit" INTEGER,
    "weeklyLimit" INTEGER,
    "minSpacingMs" INTEGER,
    "allowedStartMinute" INTEGER,
    "allowedEndMinute" INTEGER,
    "budgetCents" INTEGER,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "approvalState" "ApprovalState" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AdvertisingCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignChannel" (
    "campaignId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,

    CONSTRAINT "CampaignChannel_pkey" PRIMARY KEY ("campaignId","channelId")
);

-- CreateTable
CREATE TABLE "Advertisement" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Advertisement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialBreak" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channelId" TEXT,
    "defaultDurationMs" INTEGER NOT NULL,
    "minDurationMs" INTEGER NOT NULL,
    "maxDurationMs" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CommercialBreak_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdAiring" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "advertisementId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "scheduleItemId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "plannedStartAt" TIMESTAMPTZ(3) NOT NULL,
    "plannedDurationMs" INTEGER NOT NULL,
    "status" "AiringStatus" NOT NULL DEFAULT 'PLANNED',
    "actualStartAt" TIMESTAMPTZ(3),
    "actualDurationMs" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdAiring_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BroadcastSchedule" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "broadcastDate" DATE NOT NULL,
    "title" TEXT,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersionNo" INTEGER NOT NULL DEFAULT 1,
    "lockVersion" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "submittedAt" TIMESTAMPTZ(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMPTZ(3),
    "publishedById" TEXT,
    "publishedAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BroadcastSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleVersion" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "frozenAt" TIMESTAMPTZ(3),

    CONSTRAINT "ScheduleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleItem" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "parentId" TEXT,
    "position" INTEGER NOT NULL,
    "kind" "ScheduleItemKind" NOT NULL,
    "contentItemId" TEXT,
    "commercialBreakId" TEXT,
    "label" TEXT,
    "timingMode" "TimingMode" NOT NULL DEFAULT 'SEQUENTIAL',
    "fixedStartAt" TIMESTAMPTZ(3),
    "plannedDurationMs" INTEGER,
    "estimatedDurationMs" INTEGER,
    "gapAfterMs" INTEGER,
    "isLive" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,
    "effectiveDurationMs" INTEGER NOT NULL,
    "actualStartAt" TIMESTAMPTZ(3),
    "actualDurationMs" INTEGER,

    CONSTRAINT "ScheduleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "channelId" TEXT,
    "items" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ScheduleTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "RuleType" NOT NULL,
    "channelId" TEXT,
    "params" JSONB NOT NULL,
    "severity" "Severity" NOT NULL DEFAULT 'ERROR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ScheduleRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleValidationRun" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "lockVersion" INTEGER NOT NULL,
    "trigger" TEXT NOT NULL,
    "errorCount" INTEGER NOT NULL,
    "warningCount" INTEGER NOT NULL,
    "results" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleValidationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "submittedById" TEXT NOT NULL,
    "submittedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "status" "ApprovalRequestStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalDecision" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "decidedById" TEXT NOT NULL,
    "decision" "DecisionType" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "summary" TEXT,
    "data" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "LoginAttempt_email_createdAt_idx" ON "LoginAttempt"("email", "createdAt");

-- CreateIndex
CREATE INDEX "LoginAttempt_ip_createdAt_idx" ON "LoginAttempt"("ip", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE INDEX "UserRole_roleId_idx" ON "UserRole"("roleId");

-- CreateIndex
CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "Channel_code_key" ON "Channel"("code");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_storageKey_key" ON "MediaAsset"("storageKey");

-- CreateIndex
CREATE INDEX "MediaAsset_checksumSha256_idx" ON "MediaAsset"("checksumSha256");

-- CreateIndex
CREATE UNIQUE INDEX "ContentItem_houseNumber_key" ON "ContentItem"("houseNumber");

-- CreateIndex
CREATE INDEX "ContentItem_category_status_idx" ON "ContentItem"("category", "status");

-- CreateIndex
CREATE INDEX "ContentItem_title_idx" ON "ContentItem"("title");

-- CreateIndex
CREATE INDEX "ContentItem_updatedAt_idx" ON "ContentItem"("updatedAt");

-- CreateIndex
CREATE INDEX "ContentChannel_channelId_idx" ON "ContentChannel"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "Advertiser_name_key" ON "Advertiser"("name");

-- CreateIndex
CREATE INDEX "AdvertisingCampaign_status_startDate_endDate_idx" ON "AdvertisingCampaign"("status", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "AdvertisingCampaign_advertiserId_idx" ON "AdvertisingCampaign"("advertiserId");

-- CreateIndex
CREATE INDEX "CampaignChannel_channelId_idx" ON "CampaignChannel"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "Advertisement_contentItemId_key" ON "Advertisement"("contentItemId");

-- CreateIndex
CREATE INDEX "Advertisement_campaignId_idx" ON "Advertisement"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "AdAiring_scheduleItemId_key" ON "AdAiring"("scheduleItemId");

-- CreateIndex
CREATE INDEX "AdAiring_campaignId_plannedStartAt_idx" ON "AdAiring"("campaignId", "plannedStartAt");

-- CreateIndex
CREATE INDEX "AdAiring_scheduleId_idx" ON "AdAiring"("scheduleId");

-- CreateIndex
CREATE INDEX "BroadcastSchedule_channelId_broadcastDate_idx" ON "BroadcastSchedule"("channelId", "broadcastDate");

-- CreateIndex
CREATE INDEX "BroadcastSchedule_status_idx" ON "BroadcastSchedule"("status");

-- CreateIndex
CREATE INDEX "BroadcastSchedule_broadcastDate_idx" ON "BroadcastSchedule"("broadcastDate");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleVersion_scheduleId_versionNo_key" ON "ScheduleVersion"("scheduleId", "versionNo");

-- CreateIndex
CREATE INDEX "ScheduleItem_versionId_startAt_idx" ON "ScheduleItem"("versionId", "startAt");

-- CreateIndex
CREATE INDEX "ScheduleItem_contentItemId_idx" ON "ScheduleItem"("contentItemId");

-- CreateIndex
CREATE INDEX "ScheduleRule_isActive_idx" ON "ScheduleRule"("isActive");

-- CreateIndex
CREATE INDEX "ScheduleValidationRun_scheduleId_createdAt_idx" ON "ScheduleValidationRun"("scheduleId", "createdAt");

-- CreateIndex
CREATE INDEX "ApprovalRequest_status_submittedAt_idx" ON "ApprovalRequest"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "ApprovalRequest_scheduleId_idx" ON "ApprovalRequest"("scheduleId");

-- CreateIndex
CREATE INDEX "ApprovalDecision_requestId_idx" ON "ApprovalDecision"("requestId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentChannel" ADD CONSTRAINT "ContentChannel_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentChannel" ADD CONSTRAINT "ContentChannel_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvertisingCampaign" ADD CONSTRAINT "AdvertisingCampaign_advertiserId_fkey" FOREIGN KEY ("advertiserId") REFERENCES "Advertiser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignChannel" ADD CONSTRAINT "CampaignChannel_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdvertisingCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignChannel" ADD CONSTRAINT "CampaignChannel_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Advertisement" ADD CONSTRAINT "Advertisement_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdvertisingCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Advertisement" ADD CONSTRAINT "Advertisement_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialBreak" ADD CONSTRAINT "CommercialBreak_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdAiring" ADD CONSTRAINT "AdAiring_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdvertisingCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdAiring" ADD CONSTRAINT "AdAiring_advertisementId_fkey" FOREIGN KEY ("advertisementId") REFERENCES "Advertisement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdAiring" ADD CONSTRAINT "AdAiring_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "BroadcastSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdAiring" ADD CONSTRAINT "AdAiring_scheduleItemId_fkey" FOREIGN KEY ("scheduleItemId") REFERENCES "ScheduleItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdAiring" ADD CONSTRAINT "AdAiring_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastSchedule" ADD CONSTRAINT "BroadcastSchedule_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleVersion" ADD CONSTRAINT "ScheduleVersion_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "BroadcastSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleItem" ADD CONSTRAINT "ScheduleItem_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ScheduleVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleItem" ADD CONSTRAINT "ScheduleItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ScheduleItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleItem" ADD CONSTRAINT "ScheduleItem_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleItem" ADD CONSTRAINT "ScheduleItem_commercialBreakId_fkey" FOREIGN KEY ("commercialBreakId") REFERENCES "CommercialBreak"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleTemplate" ADD CONSTRAINT "ScheduleTemplate_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleRule" ADD CONSTRAINT "ScheduleRule_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleValidationRun" ADD CONSTRAINT "ScheduleValidationRun_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "BroadcastSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "BroadcastSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalDecision" ADD CONSTRAINT "ApprovalDecision_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ApprovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ───────── Invariants Prisma cannot express (see README "Database invariants") ─────────

-- At most one live (non-archived) schedule per channel and operational broadcast date.
CREATE UNIQUE INDEX "BroadcastSchedule_channel_date_active_key"
  ON "BroadcastSchedule" ("channelId", "broadcastDate") WHERE "status" <> 'ARCHIVED';

-- Item order is unique within a version and within each break (top level uses parentId = NULL).
CREATE UNIQUE INDEX "ScheduleItem_version_parent_position_key"
  ON "ScheduleItem" ("versionId", "parentId", "position") NULLS NOT DISTINCT;

-- Durations and minute-of-day values must be in range.
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_planned_duration_positive" CHECK ("plannedDurationMs" > 0);
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_original_duration_positive" CHECK ("originalDurationMs" IS NULL OR "originalDurationMs" > 0);
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_window_range" CHECK (
  ("allowedStartMinute" IS NULL OR "allowedStartMinute" BETWEEN 0 AND 1439) AND
  ("allowedEndMinute" IS NULL OR "allowedEndMinute" BETWEEN 0 AND 1440));
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_availability_order" CHECK (
  "availableFrom" IS NULL OR "availableUntil" IS NULL OR "availableFrom" < "availableUntil");

ALTER TABLE "Channel" ADD CONSTRAINT "Channel_day_start_range" CHECK ("broadcastDayStartMinute" BETWEEN 0 AND 1439);
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_gap_non_negative" CHECK ("defaultGapMs" >= 0 AND "underrunToleranceMs" >= 0);

ALTER TABLE "CommercialBreak" ADD CONSTRAINT "CommercialBreak_duration_order" CHECK (
  "minDurationMs" > 0 AND "minDurationMs" <= "defaultDurationMs" AND "defaultDurationMs" <= "maxDurationMs");

ALTER TABLE "AdvertisingCampaign" ADD CONSTRAINT "AdvertisingCampaign_date_order" CHECK ("startDate" <= "endDate");
ALTER TABLE "AdvertisingCampaign" ADD CONSTRAINT "AdvertisingCampaign_limits_positive" CHECK (
  ("maxAirings" IS NULL OR "maxAirings" > 0) AND ("dailyLimit" IS NULL OR "dailyLimit" > 0) AND
  ("weeklyLimit" IS NULL OR "weeklyLimit" > 0) AND ("minSpacingMs" IS NULL OR "minSpacingMs" >= 0));

-- Engine-computed timing must be coherent.
ALTER TABLE "ScheduleItem" ADD CONSTRAINT "ScheduleItem_timing_coherent" CHECK (
  "effectiveDurationMs" >= 0 AND "endAt" >= "startAt");
ALTER TABLE "ScheduleItem" ADD CONSTRAINT "ScheduleItem_fixed_has_time" CHECK (
  "timingMode" <> 'FIXED' OR "fixedStartAt" IS NOT NULL);
ALTER TABLE "ScheduleItem" ADD CONSTRAINT "ScheduleItem_kind_reference" CHECK (
  ("kind" = 'CONTENT' AND "contentItemId" IS NOT NULL) OR ("kind" = 'BREAK' AND "contentItemId" IS NULL));

ALTER TABLE "BroadcastSchedule" ADD CONSTRAINT "BroadcastSchedule_lock_version_non_negative" CHECK ("lockVersion" >= 0);
