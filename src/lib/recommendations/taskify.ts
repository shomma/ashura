import { Prisma, PrismaClient, Recommendation, Task } from '@prisma/client';
import { decodeJsonField, encodeJsonField } from '@/lib/json-fields';
import {
  RECOMMENDATION_TO_TASK_ACTION,
  RECOMMENDATION_TYPES,
  RecommendationType
} from './constants';

const ALLOWED_TASK_ACTIONS = new Set(['write', 'touch', 'rewrite', 'linking', 'research']);

type UpsertTaskFromRecommendationParams = {
  prisma: PrismaClient;
  recommendation: Recommendation;
  requestedAction?: string | null;
  titleOverride?: string | null;
};

export type UpsertTaskFromRecommendationResult = {
  task: Task;
  action: string;
  created: boolean;
  recommendationStatusUpdated: boolean;
};

export async function upsertTaskFromRecommendation(
  params: UpsertTaskFromRecommendationParams
): Promise<UpsertTaskFromRecommendationResult> {
  const recommendationType = normalizeRecommendationType(params.recommendation.type);
  const action = resolveTaskAction(recommendationType, params.requestedAction);
  const dedupeKey = buildTaskDedupeKey(params.recommendation.id, action);
  const recommendationEvidence = encodeJsonField(params.recommendation.evidence);
  const evidence = decodeJsonField<unknown>(params.recommendation.evidence, null);
  const payload = {
    recommendationId: params.recommendation.id,
    recommendationType: params.recommendation.type,
    reason: params.recommendation.reason,
    evidence,
    expectedImpact: params.recommendation.expectedImpact,
    dueAt: params.recommendation.dueAt ? params.recommendation.dueAt.toISOString() : null
  };

  const taskTitle = params.titleOverride?.trim() || params.recommendation.title;

  const existingTask = await params.prisma.task.findFirst({
    where: {
      siteId: params.recommendation.siteId,
      dedupeKey
    }
  });

  const task = existingTask
    ? await params.prisma.task.update({
        where: { id: existingTask.id },
        data: {
          title: taskTitle,
          action,
          source: 'recommendation',
          recommendationSourceId: params.recommendation.id,
          recommendationType: params.recommendation.type,
          recommendationReason: params.recommendation.reason,
          recommendationEvidence,
          recommendedDueAt: params.recommendation.dueAt,
          payload: encodeJsonField(payload)
        }
      })
    : await params.prisma.task.create({
        data: {
          siteId: params.recommendation.siteId,
          title: taskTitle,
          action,
          source: 'recommendation',
          dedupeKey,
          recommendationSourceId: params.recommendation.id,
          recommendationType: params.recommendation.type,
          recommendationReason: params.recommendation.reason,
          recommendationEvidence,
          recommendedDueAt: params.recommendation.dueAt,
          payload: encodeJsonField(payload)
        }
      });

  await params.prisma.recommendationTaskLink.upsert({
    where: {
      recommendationId_taskId: {
        recommendationId: params.recommendation.id,
        taskId: task.id
      }
    },
    update: {},
    create: {
      recommendationId: params.recommendation.id,
      taskId: task.id
    }
  });

  let recommendationStatusUpdated = false;
  if (params.recommendation.status === 'pending') {
    await params.prisma.recommendation.update({
      where: { id: params.recommendation.id },
      data: { status: 'in_progress' }
    });
    recommendationStatusUpdated = true;
  }

  return {
    task,
    action,
    created: !existingTask,
    recommendationStatusUpdated
  };
}

function normalizeRecommendationType(value: string): RecommendationType {
  if (RECOMMENDATION_TYPES.includes(value as RecommendationType)) {
    return value as RecommendationType;
  }
  return 'expansion';
}

function resolveTaskAction(type: RecommendationType, requestedAction?: string | null) {
  const requested = (requestedAction || '').trim();
  if (requested && ALLOWED_TASK_ACTIONS.has(requested)) return requested;
  return RECOMMENDATION_TO_TASK_ACTION[type];
}

function buildTaskDedupeKey(recommendationId: string, action: string) {
  return `recommendation:${recommendationId}:${action || 'write'}`;
}

