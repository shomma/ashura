import prisma from './prisma';

const FALLBACK_USER_EMAIL = 'ashura-user@local.invalid';
const FALLBACK_USER_NAME = 'ASHURA';

async function ensureLocalUser() {
  try {
    return await prisma.user.upsert({
      where: { email: FALLBACK_USER_EMAIL },
      update: {},
      create: {
        email: FALLBACK_USER_EMAIL,
        passwordHash: '',
        name: FALLBACK_USER_NAME
      }
    });
  } catch (error) {
    console.error('[auth] fallback guest upsert failed, using in-memory guest', error);
    return {
      id: 'guest-local',
      email: FALLBACK_USER_EMAIL,
      name: FALLBACK_USER_NAME,
      passwordHash: '',
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }
}

export async function getCurrentUser() {
  return ensureLocalUser();
}

export async function requireUser() {
  return ensureLocalUser();
}

export async function requireAuthenticatedUser() {
  return ensureLocalUser();
}
