'use client';

import { useMemo } from 'react';
import { renderMarkdownToHtml } from '@/lib/markdown';

type Props = {
  content: string;
  allowHtml?: boolean;
  className?: string;
};

export default function MarkdownPreview({ content, allowHtml = false, className = 'markdown-body' }: Props) {
  const html = useMemo(
    () => renderMarkdownToHtml(content || '', { allowHtml }),
    [content, allowHtml]
  );
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
