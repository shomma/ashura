import prisma from '@/lib/prisma';
import { fail, ok } from '@/lib/api-v1';
import { ensureSingleSite } from '@/lib/single-site';

export const runtime = 'nodejs';

type ReadinessCheck = {
  id: string;
  label: string;
  required: boolean;
  ready: boolean;
  howTo: string;
  detail?: string;
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const siteId = searchParams.get('siteId')?.trim();
    const site = await withTransientDbRetry(() => ensureSingleSite());
    if (!site) {
      return fail(req, 404, 'NOT_FOUND', 'site not found');
    }

    const checks: ReadinessCheck[] = [
      {
        id: 'gemini',
        label: 'Gemini API',
        required: true,
        ready: Boolean(process.env.GEMINI_API_KEY),
        howTo: '実行環境に GEMINI_API_KEY を設定してください。',
        detail: process.env.GEMINI_API_KEY ? '環境変数設定済み' : 'GEMINI_API_KEY が未設定です。'
      },
      {
        id: 'epg',
        label: '番組表取得（EPG）',
        required: true,
        ready: true,
        howTo: '追加APIキー不要です。番組表取得ボタンから利用できます。',
        detail: 'EPG 取得は標準で利用可能です。'
      }
    ];

    const [watchKeywordCount, upcomingProgramCount, recommendationPendingCount, taskOpenCount] =
      await withTransientDbRetry(() =>
        Promise.all([
          prisma.watchKeyword.count({ where: { active: true } }),
          prisma.program.count({
            where: {
              start: { gte: new Date() },
              end: { lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }
            }
          }),
          prisma.recommendation.count({
            where: {
              siteId: site.id,
              status: { in: ['pending', 'in_progress'] }
            }
          }),
          prisma.task.count({
            where: {
              siteId: site.id,
              status: { in: ['pending', 'in_progress', 'blocked'] }
            }
          })
        ])
      );

    const requiredChecks = checks.filter((item) => item.required);
    const optionalChecks = checks.filter((item) => !item.required);
    const requiredReady = requiredChecks.filter((item) => item.ready).length;
    const optionalReady = optionalChecks.filter((item) => item.ready).length;

    return ok(req, {
      siteId: site.id,
      requestedSiteId: siteId || null,
      summary: {
        requiredTotal: requiredChecks.length,
        requiredReady,
        optionalTotal: optionalChecks.length,
        optionalReady,
        allRequiredReady: requiredReady === requiredChecks.length
      },
      checks,
      pipelineContext: {
        activeWatchKeywords: watchKeywordCount,
        upcomingPrograms7d: upcomingProgramCount,
        pendingRecommendations: recommendationPendingCount,
        openTasks: taskOpenCount
      }
    });
  } catch (error: any) {
    if (isTransientDbError(error)) {
      return fail(
        req,
        503,
        'SERVICE_UNAVAILABLE',
        'データベース接続が不安定です。数秒後に再試行してください。'
      );
    }
    return fail(req, 500, 'INTERNAL_ERROR', String(error?.message || error));
  }
}

async function withTransientDbRetry<T>(fn: () => Promise<T>) {
  let attempt = 0;
  let lastError: unknown;

  while (attempt < 3) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isTransientDbError(error) || attempt === 2) {
        throw error;
      }
      await sleep(250 * (attempt + 1));
      attempt += 1;
    }
  }

  throw lastError;
}

function isTransientDbError(error: unknown) {
  const message = String((error as any)?.message || error || '');
  return /P1001|Can't reach database server|ETIMEDOUT|ECONNRESET|timeout|timed out/i.test(message);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
