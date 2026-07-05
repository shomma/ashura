import prisma from './prisma';
import { requireUser } from './auth';

const DEFAULT_OWNER_EMAIL = 'ashura-owner@local.invalid';
const DEFAULT_OWNER_NAME = 'ASHURA';
const DEFAULT_SITE_ID = 'ashura-single-site';
const DEFAULT_SITE_NAME = 'ASHURA';

type SiteLike = {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
};

export function getConfiguredSingleSiteId() {
  return DEFAULT_SITE_ID;
}

export function getConfiguredSingleSiteName() {
  return DEFAULT_SITE_NAME;
}

function isBuildPhase() {
  return process.env.NEXT_PHASE?.includes('build') || process.env.NEXT_PHASE?.includes('export');
}

function createFallbackSite(): SiteLike {
  const now = new Date();
  return {
    id: DEFAULT_SITE_ID,
    name: DEFAULT_SITE_NAME,
    createdAt: now,
    updatedAt: now
  };
}

export async function ensureSingleOwner() {
  if (isBuildPhase()) {
    return {
      id: 'owner-local',
      email: DEFAULT_OWNER_EMAIL,
      passwordHash: '',
      name: DEFAULT_OWNER_NAME,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  return prisma.user.upsert({
    where: { email: DEFAULT_OWNER_EMAIL },
    update: { name: DEFAULT_OWNER_NAME },
    create: {
      email: DEFAULT_OWNER_EMAIL,
      passwordHash: '',
      name: DEFAULT_OWNER_NAME
    }
  });
}

export async function ensureSingleSite(): Promise<SiteLike> {
  if (isBuildPhase()) {
    return createFallbackSite();
  }

  const owner = await ensureSingleOwner();
  const configuredId = getConfiguredSingleSiteId();
  const existing =
    (await prisma.site.findUnique({ where: { id: configuredId } })) ||
    (await prisma.site.findFirst({ orderBy: { createdAt: 'asc' } }));

  const siteName = getConfiguredSingleSiteName();

  if (existing) {
    const updates: { ownerId: string; name?: string } = {
      ownerId: owner.id
    };

    if (existing.name !== siteName) updates.name = siteName;

    return prisma.site.update({
      where: { id: existing.id },
      data: updates
    });
  }

  return prisma.site.upsert({
    where: { id: configuredId },
    update: {
      ownerId: owner.id,
      name: siteName
    },
    create: {
      id: configuredId,
      ownerId: owner.id,
      name: siteName
    }
  });
}

export async function resolveSingleSiteId() {
  const site = await ensureSingleSite();
  return site.id;
}

export async function requireSingleSite() {
  if (!isBuildPhase()) {
    await requireUser();
  }
  return ensureSingleSite();
}

export function toSingleSiteOptions(site: { id: string; name: string }) {
  return [{ id: site.id, name: site.name }];
}
