import Link from 'next/link';

type OperationFlowGuideProps = {
  current: string;
  aiBusy?: boolean;
  aiLabel?: string;
  hideStepDetails?: boolean;
  hideStepLinks?: boolean;
};

type FlowStep = {
  id: 'channel' | 'keywords-discovery' | 'article-production';
  label: string;
  caption: string;
  href: string;
};

const FLOW_STEPS: FlowStep[] = [
  {
    id: 'channel',
    label: '番組表取得',
    caption: '番組表データを取得して保存します。ここでは候補抽出や下書き生成は行いません。',
    href: '/dashboard/channel'
  },
  {
    id: 'keywords-discovery',
    label: '需要・競合調査',
    caption: '取得済み番組表に登録キーワードがヒットしているか確認し、検索需要と競合の弱さを評価します。',
    href: '/dashboard/keywords/discovery'
  },
  {
    id: 'article-production',
    label: '記事下書き',
    caption: '調査結果をもとに、タイトル案、構成案、本文下書きを作成します。',
    href: '/dashboard/recommendations'
  }
];

const CURRENT_ALIAS: Record<string, FlowStep['id']> = {
  channel: 'channel',
  radar: 'channel',
  'command-center': 'channel',
  'settings-api': 'channel',
  opportunities: 'keywords-discovery',
  seo: 'keywords-discovery',
  'keywords-discovery': 'keywords-discovery',
  tasks: 'article-production',
  recommendations: 'article-production',
  insights: 'article-production'
};

function toFlowId(current: string): FlowStep['id'] {
  return CURRENT_ALIAS[current] ?? 'channel';
}

function stateForIndex(index: number, activeIndex: number) {
  if (index < activeIndex) return 'done';
  if (index === activeIndex) return 'active';
  if (index === activeIndex + 1) return 'next';
  return 'pending';
}

export default function OperationFlowGuide({
  current,
  aiBusy = false,
  aiLabel,
  hideStepDetails = false,
  hideStepLinks = false
}: OperationFlowGuideProps) {
  const activeId = toFlowId(current);
  const activeIndex = FLOW_STEPS.findIndex((step) => step.id === activeId);
  const safeIndex = activeIndex >= 0 ? activeIndex : 0;
  const progress = Math.round(((safeIndex + 1) / FLOW_STEPS.length) * 100);
  const activeStep = FLOW_STEPS[safeIndex];

  return (
    <section className="card operation-flow-card" data-flow-guide="main">
      <div className="operation-flow-topline">
        <p className="operation-flow-step-count">
          Step {safeIndex + 1} / {FLOW_STEPS.length}
        </p>
        <p className={`operation-flow-ai${aiBusy ? ' busy' : ''}`}>
          <span className="operation-flow-ai-dot" />
          {aiLabel || (aiBusy ? 'AI処理中' : 'AI待機中')}
        </p>
      </div>

      {!hideStepDetails ? (
        <div className="stack" style={{ gap: 6 }}>
          <h2 className="operation-flow-title">現在の工程: {activeStep.label}</h2>
          <p className="helper-text">{activeStep.caption}</p>
        </div>
      ) : null}

      <div className="operation-flow-progress" role="presentation">
        <div className="operation-flow-progress-value" style={{ width: `${progress}%` }} />
      </div>

      {!hideStepLinks ? (
        <div className="operation-flow-steps">
          {FLOW_STEPS.map((step, index) => {
            const state = stateForIndex(index, safeIndex);
            return (
              <Link key={step.id} href={step.href} className={`operation-flow-step ${state}`}>
                <span className="operation-flow-step-index">{index + 1}</span>
                <span>{step.label}</span>
              </Link>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
