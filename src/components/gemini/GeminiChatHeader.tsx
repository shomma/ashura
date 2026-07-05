'use client';

import { useEffect, useMemo, useState } from 'react';
import { useGeminiContext } from './GeminiContext';
import { buildContextString } from '@/lib/ai/context';
import MarkdownPreview from '@/components/MarkdownPreview';

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

export default function GeminiChatHeader() {
  const { contextText, contextEntries } = useGeminiContext();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recentHistory = useMemo(() => messages.slice(-6), [messages]);

  const combinedContext = useMemo(
    () =>
      buildContextString({
        currentPage: contextText,
        allPages: contextEntries.map((entry) => ({
          key: entry.key,
          label: entry.label,
          updatedAt: new Date(entry.updatedAt).toISOString(),
          context: entry.text
        }))
      }),
    [contextText, contextEntries]
  );

  useEffect(() => {
    setMessages([]);
    setError(null);
  }, [combinedContext]);

  async function sendMessage() {
    const content = input.trim();
    if (!content || busy) return;
    setBusy(true);
    setError(null);

    const nextMessages: Message[] = [...messages, { role: 'user', content }];
    setMessages(nextMessages);
    setInput('');

    try {
      const res = await fetch('/api/ai/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content,
          context: combinedContext,
          history: recentHistory
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'ジェミニに接続できませんでした。');
      const replyMessage: Message = { role: 'assistant', content: String(json.reply || '') };
      setMessages([...nextMessages, replyMessage]);
    } catch (e: any) {
      setError(e?.message ? String(e.message) : 'ジェミニに接続できませんでした。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gemini-header">
      <div className="gemini-header-title">
        <div style={{ fontWeight: 700 }}>メインジェミニチャット</div>
        <span className="helper-text">
          現在ページ＋全ページの情報をコンテキストとして回答します。
        </span>
      </div>
      <div className="gemini-header-chat">
        <div className="gemini-messages">
          {messages.length === 0 && (
            <div className="helper-text">質問を送信すると履歴が表示されます。</div>
          )}
          {messages.map((msg, idx) => (
            <div key={`${msg.role}-${idx}`} className={`gemini-message ${msg.role}`}>
              <span className="gemini-role">{msg.role === 'assistant' ? 'ジェミニ' : 'あなた'}</span>
              <MarkdownPreview content={msg.content} />
            </div>
          ))}
        </div>
        <div className="gemini-input-row">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="全体の状況について相談..."
          />
          <button className="secondary-button" type="button" onClick={sendMessage} disabled={busy}>
            {busy ? '送信中...' : '送信'}
          </button>
        </div>
        {error && <div className="error-text">{error}</div>}
      </div>
    </div>
  );
}

