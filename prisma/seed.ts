/**
 * Development / demonstration seed.
 *
 * Creates roles, permissions, DEVELOPMENT-ONLY users, channels, content, advertising and schedules.
 * Schedules are built and moved through the workflow by the real services, so seeded times, airings
 * and audit records are produced by the same code paths the application uses.
 *
 * Refuses to run when NODE_ENV=production unless ALLOW_PRODUCTION_SEED=yes.
 * Users share the password in SEED_PASSWORD (default documented in README — change it for any shared environment).
 */
import { PrismaClient, type ContentCategory } from '@prisma/client';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { hashPassword } from '../src/server/auth/password';
import { PERMISSIONS, ROLES } from '../src/server/auth/permissions';
import type { Actor } from '../src/server/auth/actor';
import { addDaysIso, isoToDbDate } from '../src/lib/time/zoned';
import { currentBroadcastDate } from '../src/server/services/dashboard';
import { createSchedule, saveScheduleItems, getScheduleView } from '../src/server/services/schedules';
import { transitionSchedule } from '../src/server/services/workflow';
import type { ItemInput } from '../src/server/validators/schedule';

const prisma = new PrismaClient();
const MIN = 60_000;
const SEC = 1000;

const USERS: Array<{ email: string; name: string; roles: string[] }> = [
  { email: 'superadmin@bat.local', name: 'Sam Perera (Super Admin)', roles: ['SUPER_ADMIN'] },
  { email: 'admin@bat.local', name: 'Nimali Silva (Admin)', roles: ['ADMIN'] },
  { email: 'chief@bat.local', name: 'Ruwan Fernando (Chief Scheduler)', roles: ['CHIEF_SCHEDULER'] },
  { email: 'scheduler@bat.local', name: 'Dilini Jayasuriya (Scheduler)', roles: ['SCHEDULER'] },
  { email: 'content@bat.local', name: 'Kasun Wickrama (Content)', roles: ['CONTENT_MANAGER'] },
  { email: 'ads@bat.local', name: 'Tharushi Gunawardena (Ad Sales)', roles: ['AD_MANAGER'] },
  { email: 'approver@bat.local', name: 'Anura Bandara (Approver)', roles: ['APPROVER'] },
  { email: 'viewer@bat.local', name: 'Priya Rajapaksa (Reports)', roles: ['REPORTS_VIEWER'] },
];

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PRODUCTION_SEED !== 'yes') {
    throw new Error('Refusing to seed a production environment.');
  }
  if ((await prisma.user.count()) > 0) {
    console.log('Database already contains users — skipping seed. Run `npm run db:reset` for a fresh demo database.');
    return;
  }
  const password = process.env.SEED_PASSWORD ?? 'BatDemo!2026pass';

  // ── Roles & permissions ──
  for (const [key, description] of Object.entries(PERMISSIONS)) await prisma.permission.create({ data: { key, description } });
  const perms = new Map((await prisma.permission.findMany()).map((p) => [p.key, p.id]));
  for (const [key, def] of Object.entries(ROLES)) {
    await prisma.role.create({
      data: { key, name: def.name, description: def.description, isSystem: true, permissions: { create: def.permissions.map((p) => ({ permissionId: perms.get(p)! })) } },
    });
  }
  const roles = new Map((await prisma.role.findMany()).map((r) => [r.key, r.id]));
  const hash = await hashPassword(password);
  for (const u of USERS) {
    await prisma.user.create({ data: { email: u.email, name: u.name, passwordHash: hash, roles: { create: u.roles.map((r) => ({ roleId: roles.get(r)! })) } } });
  }

  // ── Channels ──
  const bat1 = await prisma.channel.create({ data: { code: 'BAT1', name: 'BAT Television', timeZone: 'Asia/Colombo', broadcastDayStartMinute: 360, playoutSystem: 'Not connected (demo)' } });
  const batn = await prisma.channel.create({ data: { code: 'BATN', name: 'BAT News 24', timeZone: 'Asia/Colombo', broadcastDayStartMinute: 300 } });

  // ── Media assets (demo placeholders: tiny files with valid headers, not playable media) ──
  const dir = path.resolve(process.env.STORAGE_LOCAL_DIR ?? './storage/uploads');
  await mkdir(dir, { recursive: true });
  const asset = async (name: string, kind: 'mp4' | 'png') => {
    const bytes = kind === 'png' ? Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4ff0000000049454e44ae426082', 'hex') : Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(12)]);
    const key = `${randomUUID()}.${kind}`;
    await writeFile(path.join(dir, key), bytes);
    return prisma.mediaAsset.create({ data: { originalName: `${name}.${kind}`, storageKey: key, mimeType: kind === 'png' ? 'image/png' : 'video/mp4', sizeBytes: bytes.length, checksumSha256: createHash('sha256').update(bytes).digest('hex') } });
  };

  // ── Content ──
  const mk = async (title: string, category: ContentCategory, durationMs: number, extra: Record<string, unknown> = {}, withAsset = true) => {
    const a = withAsset ? await asset(title.replace(/[^a-z0-9]+/gi, '_').toLowerCase(), category === 'SLIDE' ? 'png' : 'mp4') : null;
    return prisma.contentItem.create({
      data: { title, category, plannedDurationMs: durationMs, originalDurationMs: durationMs, assetId: a?.id ?? null, language: 'si', houseNumber: `H${String(Math.floor(Math.random() * 90000) + 10000)}`, ...extra },
    });
  };
  const c = {
    gml: await mk('Good Morning Lanka', 'PROGRAM', 117 * MIN, { rating: 'G' }),
    morningNews: await mk('Morning News', 'NEWS', 27 * MIN),
    kids: await mk('Kids Club', 'PROGRAM', 57 * MIN, { rating: 'G', allowedStartMinute: 6 * 60, allowedEndMinute: 20 * 60 }),
    cooking: await mk('Cooking with Amma', 'PROGRAM', 27 * MIN),
    drama: await mk('Teledrama: Ran Kanda', 'PROGRAM', 57 * MIN, { rating: 'PG' }),
    docu1: await mk('Documentary: Wild Sri Lanka', 'PROGRAM', 57 * MIN, { rightsHolder: 'Lanka Docs Ltd', licenseNotes: '3 runs per month' }),
    midNews: await mk('Midday News', 'NEWS', 27 * MIN),
    matinee: await mk('Afternoon Matinee: The Lost Elephant', 'MOVIE', 117 * MIN, { rating: 'G', rightsHolder: 'Island Films', isDurationEditable: false }),
    docu2: await mk('Documentary: Ocean Giants', 'PROGRAM', 57 * MIN),
    music: await mk('Music Hour', 'PROGRAM', 57 * MIN),
    sports: await mk('Sports Roundup', 'PROGRAM', 27 * MIN),
    quiz: await mk('Quiz Time', 'PROGRAM', 57 * MIN),
    eveNews: await mk('Evening News', 'NEWS', 27 * MIN),
    prime: await mk('Prime Time Movie: Monsoon Hearts', 'MOVIE', 117 * MIN, { rating: 'PG13', isDurationEditable: false }),
    talk: await mk('Talk Tonight (Live)', 'LIVE', 27 * MIN, {}, false),
    late: await mk('Late Night Movie: Midnight Run', 'MOVIE', 117 * MIN, { rating: '18', isDurationEditable: false }),
    lateNews: await mk('Late News', 'NEWS', 27 * MIN),
    slides: await mk('Overnight Slides Loop', 'SLIDE', 60 * MIN),
    promoDrama: await mk('Promo: Ran Kanda tonight', 'PROMO', 30 * SEC),
    promoMovie: await mk('Promo: Weekend Movie', 'PROMO', 30 * SEC),
    stationId: await mk('Station ID — BAT', 'STATION_ID', 30 * SEC),
    psa: await mk('PSA: Road Safety', 'PSA', 30 * SEC),
    filler1: await mk('Filler: Scenic Lanka 2 min', 'FILLER', 2 * MIN),
    filler2: await mk('Filler: Tea Country 5 min', 'FILLER', 5 * MIN),
    special: await mk('Special Event: Independence Day Parade', 'SPECIAL_EVENT', 180 * MIN, {}, false),
    breaking: await mk('Breaking News Live', 'LIVE', 15 * MIN, {}, false),
    pendingMovie: await mk('New Release: River of Stars', 'MOVIE', 120 * MIN, { approvalState: 'PENDING', rating: 'PG' }),
  };

  // ── Advertising ──
  const soda = await prisma.advertiser.create({ data: { name: 'Ceylon Soda Co.', contactName: 'M. de Silva', contactEmail: 'media@ceylonsoda.example' } });
  const bank = await prisma.advertiser.create({ data: { name: 'TeleBank PLC', contactName: 'A. Hettiarachchi' } });
  const mart = await prisma.advertiser.create({ data: { name: 'FreshMart Supermarkets' } });
  const today = currentBroadcastDate(new Date(), 'Asia/Colombo', 360);
  const campaign = async (name: string, advertiserId: string, extra: Record<string, unknown>, creatives: string[]) => {
    const camp = await prisma.advertisingCampaign.create({
      data: { name, advertiserId, startDate: isoToDbDate(addDaysIso(today, -30)), endDate: isoToDbDate(addDaysIso(today, 30)), status: 'ACTIVE', approvalState: 'APPROVED', ...extra },
    });
    const ads = [];
    for (const t of creatives) {
      const content = await mk(t, 'ADVERTISEMENT', 30 * SEC, { isDurationEditable: false });
      await prisma.advertisement.create({ data: { campaignId: camp.id, contentItemId: content.id } });
      ads.push(content);
    }
    return { camp, ads };
  };
  const sodaC = await campaign('Soda Summer Splash', soda.id, { priority: 2, dailyLimit: 40, maxAirings: 3000, contractedAirings: 2400 }, ['Ceylon Soda — Splash 30s', 'Ceylon Soda — Fizz 30s']);
  const bankC = await campaign('TeleBank Home Loans', bank.id, { priority: 3, dailyLimit: 20, minSpacingMs: 20 * MIN, maxAirings: 900, contractedAirings: 800, channels: { create: [{ channelId: bat1.id }] } }, ['TeleBank — Home Loans 30s']);
  const martC = await campaign('FreshMart Weekend Deals', mart.id, { priority: 5, dailyLimit: 20, allowedStartMinute: 6 * 60, allowedEndMinute: 22 * 60, maxAirings: 600 }, ['FreshMart — Weekend Deals 30s']);
  await prisma.advertisingCampaign.create({ data: { name: 'Soda Winter (draft)', advertiserId: soda.id, startDate: isoToDbDate(addDaysIso(today, 40)), endDate: isoToDbDate(addDaysIso(today, 80)) } });

  const brk = await prisma.commercialBreak.create({ data: { name: 'Standard break', defaultDurationMs: 3 * MIN, minDurationMs: 2 * MIN, maxDurationMs: 4 * MIN } });
  await prisma.commercialBreak.create({ data: { name: 'Short break', defaultDurationMs: 90 * SEC, minDurationMs: 60 * SEC, maxDurationMs: 2 * MIN } });
  await prisma.commercialBreak.create({ data: { name: 'Prime-time break', channelId: bat1.id, defaultDurationMs: 4 * MIN, minDurationMs: 3 * MIN, maxDurationMs: 5 * MIN } });

  // ── Rules ──
  await prisma.scheduleRule.createMany({
    data: [
      { name: 'Adult-rated films after 22:00', type: 'RATING_TIME_WINDOW', severity: 'ERROR', params: { ratings: ['18'], startMinute: 22 * 60, endMinute: 5 * 60 } },
      { name: 'No movie repeat within 6 hours', type: 'NO_DUPLICATE_CONTENT', severity: 'WARNING', params: { withinMinutes: 360, categories: ['MOVIE'] } },
      { name: 'Movies require content approval', type: 'CATEGORY_REQUIRES_APPROVAL', severity: 'WARNING', params: { categories: ['MOVIE'] } },
      { name: 'Dead air longer than 2 minutes', type: 'MAX_GAP', severity: 'ERROR', params: { maxGapMs: 2 * MIN } },
    ],
  });

  // ── Schedules via the real services ──
  const actor = async (email: string): Promise<Actor> => {
    const u = await prisma.user.findUniqueOrThrow({ where: { email }, include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } } });
    return { id: u.id, name: u.name, email: u.email, roles: u.roles.map((r) => r.role.key), permissions: new Set(u.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.key))), ip: '127.0.0.1' };
  };
  const scheduler = await actor('scheduler@bat.local');
  const approver = await actor('approver@bat.local');

  const programs = [c.gml, c.morningNews, c.kids, c.cooking, c.drama, c.docu1, c.midNews, c.matinee, c.docu2, c.music, c.sports, c.quiz, c.drama, c.eveNews, c.prime, c.talk, c.late, c.lateNews];
  const dayItems = (): ItemInput[] => {
    const items: ItemInput[] = [];
    let minute = 6 * 60;
    programs.forEach((p, i) => {
      items.push({ kind: 'CONTENT', contentItemId: p.id, timingMode: 'SEQUENTIAL', isLive: p.category === 'LIVE' });
      minute += p.plannedDurationMs / MIN;
      const breakStartMinute = minute % 1440;
      const martAllowed = breakStartMinute >= 6 * 60 && breakStartMinute < 22 * 60 - 3;
      items.push({
        kind: 'BREAK',
        commercialBreakId: brk.id,
        timingMode: 'SEQUENTIAL',
        children: [
          { kind: 'CONTENT', contentItemId: sodaC.ads[0].id, timingMode: 'SEQUENTIAL' },
          { kind: 'CONTENT', contentItemId: (i % 2 === 0 ? bankC.ads[0] : c.psa).id, timingMode: 'SEQUENTIAL' },
          { kind: 'CONTENT', contentItemId: (martAllowed ? martC.ads[0] : c.psa).id, timingMode: 'SEQUENTIAL' },
          { kind: 'CONTENT', contentItemId: (i % 2 === 0 ? c.promoDrama : c.promoMovie).id, timingMode: 'SEQUENTIAL' },
          { kind: 'CONTENT', contentItemId: sodaC.ads[1].id, timingMode: 'SEQUENTIAL' },
          { kind: 'CONTENT', contentItemId: c.stationId.id, timingMode: 'SEQUENTIAL' },
        ],
      });
      minute += 3;
    });
    // Overnight slides fill to the end of the broadcast day (00:30 → 06:00).
    items.push({ kind: 'CONTENT', contentItemId: c.slides.id, timingMode: 'SEQUENTIAL', plannedDurationMs: 330 * MIN });
    return items;
  };

  const build = async (date: string, flow: 'publish' | 'submit' | 'draft') => {
    const s = await createSchedule(scheduler, { channelId: bat1.id, broadcastDate: date });
    let view = await saveScheduleItems(scheduler, s.id, { lockVersion: (await getScheduleView(scheduler, s.id)).lockVersion, items: dayItems() });
    if (view.errorCount) {
      console.error(view.conflicts.filter((x) => x.severity === 'ERROR'));
      throw new Error(`Seed schedule ${date} has ${view.errorCount} errors`);
    }
    if (flow === 'draft') return view;
    view = await transitionSchedule(scheduler, s.id, 'submit', { lockVersion: view.lockVersion, note: 'Seeded schedule' });
    if (flow === 'submit') return view;
    view = await transitionSchedule(approver, s.id, 'approve', { lockVersion: view.lockVersion });
    return transitionSchedule(approver, s.id, 'publish', { lockVersion: view.lockVersion });
  };

  await build(addDaysIso(today, -1), 'publish');
  await build(today, 'publish');
  await build(addDaysIso(today, 1), 'submit');
  await build(addDaysIso(today, 2), 'draft');

  // A partly-built news channel draft (shows underrun / gap warnings in the UI).
  const news = await createSchedule(scheduler, { channelId: batn.id, broadcastDate: today, title: 'News 24 — rolling' });
  const nv = await getScheduleView(scheduler, news.id);
  await saveScheduleItems(scheduler, news.id, {
    lockVersion: nv.lockVersion,
    items: [
      { kind: 'CONTENT', contentItemId: c.morningNews.id, timingMode: 'SEQUENTIAL' },
      { kind: 'CONTENT', contentItemId: c.filler1.id, timingMode: 'SEQUENTIAL' },
      { kind: 'CONTENT', contentItemId: c.midNews.id, timingMode: 'FIXED', fixedTime: '06:00' },
      { kind: 'CONTENT', contentItemId: c.eveNews.id, timingMode: 'FIXED', fixedTime: '07:00' },
    ],
  });

  console.log(`Seed complete. Broadcast date "today" = ${today}. ${USERS.length} development users created (see README).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
