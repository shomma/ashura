'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';

export type SidebarProgressStep = {
  id: string;
  label: string;
  caption: string;
  href: string;
  matchPrefixes?: string[];
};

type SidebarNavProps = {
  steps: SidebarProgressStep[];
};

type StepState = 'done' | 'active' | 'pending';

function calcMatcherScore(pathname: string, matcher: string): number {
  if (!matcher) return -1;
  if (pathname === matcher) return matcher.length + 1000;
  if (pathname.startsWith(`${matcher}/`)) return matcher.length;
  return -1;
}

function findActiveStepIndex(pathname: string, steps: SidebarProgressStep[]) {
  let bestIndex = 0;
  let bestScore = -1;

  for (const [index, step] of steps.entries()) {
    const matchers = [step.href, ...(step.matchPrefixes ?? [])];
    for (const matcher of matchers) {
      const score = calcMatcherScore(pathname, matcher);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
  }

  return bestIndex;
}

function stepState(index: number, activeIndex: number): StepState {
  if (index < activeIndex) return 'done';
  if (index === activeIndex) return 'active';
  return 'pending';
}

function stepMarker(state: StepState) {
  if (state === 'done') return '✓';
  if (state === 'active') return '▶';
  return '○';
}

function stateLabel(state: StepState) {
  if (state === 'done') return '完了';
  if (state === 'active') return '進行中';
  return '待機';
}

export default function SidebarNav({ steps }: SidebarNavProps) {
  const pathname = usePathname();
  const activeIndex = useMemo(() => findActiveStepIndex(pathname, steps), [pathname, steps]);
  const progress = Math.round(((activeIndex + 1) / Math.max(1, steps.length)) * 100);

  return (
    <nav className="sidebar-nav" aria-label="ASHURA操作ナビゲーション">
      <p className="sidebar-nav-title">ASHURA FLOW</p>
      <p className="helper-text">
        Step {activeIndex + 1} / {steps.length}
      </p>
      <div className="sidebar-progress-track" role="presentation">
        <div className="sidebar-progress-value" style={{ width: `${progress}%` }} />
      </div>

      <ol className="sidebar-progress-list">
        {steps.map((step, index) => {
          const state = stepState(index, activeIndex);
          return (
            <li key={step.id} className={`sidebar-progress-item ${state}`}>
              <Link
                className="sidebar-progress-link"
                href={step.href}
                aria-current={state === 'active' ? 'step' : undefined}
              >
                <span className={`sidebar-progress-marker ${state}`} aria-hidden>
                  {stepMarker(state)}
                </span>
                <span className="sidebar-progress-body">
                  <strong className="sidebar-progress-label">{step.label}</strong>
                  <span className="sidebar-progress-caption">{step.caption}</span>
                  <span className="sidebar-progress-state">{stateLabel(state)}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
      <p className="helper-text">上から順に進めると、番組表取得から記事下書きまで進行できます。</p>
    </nav>
  );
}
