export type MarkdownRenderOptions = {
  allowHtml?: boolean;
};

type Segment = { type: 'text'; content: string } | { type: 'code'; content: string; lang?: string };

export function renderMarkdownToHtml(input: string, options?: MarkdownRenderOptions) {
  if (!input) return '';
  const allowHtml = Boolean(options?.allowHtml);
  const normalized = input.replace(/\r\n/g, '\n');

  if (allowHtml && looksLikeHtml(normalized)) {
    return normalized;
  }

  const segments = splitByCodeBlocks(normalized);
  return segments
    .map((segment) => {
      if (segment.type === 'code') {
        const langClass = segment.lang ? ` class="language-${segment.lang}"` : '';
        return `<pre class="code-block"><code${langClass}>${escapeHtml(segment.content)}</code></pre>`;
      }
      return renderMarkdownText(segment.content, allowHtml);
    })
    .join('');
}

function splitByCodeBlocks(text: string): Segment[] {
  const segments: Segment[] = [];
  const regex = /```(\w+)?\n([\s\S]*?)```/g;
  let lastIndex = 0;
  for (const match of text.matchAll(regex)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, index) });
    }
    segments.push({ type: 'code', lang: match[1], content: match[2] ?? '' });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }
  return segments;
}

function renderMarkdownText(text: string, allowHtml: boolean) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let html = '';
  let paragraph: string[] = [];
  let inUl = false;
  let inOl = false;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const content = applyInline(paragraph.join('\n'));
    html += `<p>${content}</p>`;
    paragraph = [];
  };

  const closeLists = () => {
    if (inUl) {
      html += '</ul>';
      inUl = false;
    }
    if (inOl) {
      html += '</ol>';
      inOl = false;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      closeLists();
      continue;
    }

    if (allowHtml && looksLikeHtml(trimmed)) {
      flushParagraph();
      closeLists();
      html += trimmed;
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      closeLists();
      const level = headingMatch[1].length;
      const content = applyInline(headingMatch[2]);
      html += `<h${level}>${content}</h${level}>`;
      continue;
    }

    const ulMatch = trimmed.match(/^[-*+]\s+(.*)$/);
    if (ulMatch) {
      flushParagraph();
      if (!inUl) {
        closeLists();
        html += '<ul>';
        inUl = true;
      }
      html += `<li>${applyInline(ulMatch[1])}</li>`;
      continue;
    }

    const olMatch = trimmed.match(/^\d+\.\s+(.*)$/);
    if (olMatch) {
      flushParagraph();
      if (!inOl) {
        closeLists();
        html += '<ol>';
        inOl = true;
      }
      html += `<li>${applyInline(olMatch[1])}</li>`;
      continue;
    }

    const quoteMatch = trimmed.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      flushParagraph();
      closeLists();
      html += `<blockquote>${applyInline(quoteMatch[1])}</blockquote>`;
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();
  closeLists();
  return html;
}

function applyInline(text: string) {
  let safe = escapeHtml(text);
  safe = safe.replace(/`([^`]+)`/g, (_m, code) => `<code>${escapeHtml(code)}</code>`);
  safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  safe = safe.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  safe = safe.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  safe = safe.replace(/\n/g, '<br />');
  return safe;
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function looksLikeHtml(text: string) {
  return /<\s*\/?[a-z][\s\S]*>/i.test(text);
}
