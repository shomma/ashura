'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type GeminiContextEntry = {
  key: string;
  label: string;
  text: string;
  updatedAt: number;
};

type GeminiContextValue = {
  contextText: string;
  contextEntries: GeminiContextEntry[];
  setContextText: (value: string) => void;
  setContextEntry: (entry: { key: string; label?: string; text: string }) => void;
};

const GeminiContext = createContext<GeminiContextValue | undefined>(undefined);

export function GeminiContextProvider({
  children
}: {
  children: ReactNode;
}) {
  const [contextText, setContextText] = useState('');
  const [entries, setEntries] = useState<Record<string, GeminiContextEntry>>({});

  const setContextEntry = useCallback((entry: { key: string; label?: string; text: string }) => {
    setContextText(entry.text);
    setEntries((prev) => ({
      ...prev,
      [entry.key]: {
        key: entry.key,
        label: entry.label || entry.key,
        text: entry.text,
        updatedAt: Date.now()
      }
    }));
  }, []);

  const contextEntries = useMemo(
    () => Object.values(entries).sort((a, b) => b.updatedAt - a.updatedAt),
    [entries]
  );

  const value = useMemo(
    () => ({
      contextText,
      contextEntries,
      setContextText,
      setContextEntry
    }),
    [contextText, contextEntries, setContextEntry]
  );

  return <GeminiContext.Provider value={value}>{children}</GeminiContext.Provider>;
}

export function useGeminiContext() {
  const ctx = useContext(GeminiContext);
  if (!ctx) {
    throw new Error('GeminiContextProvider is missing');
  }
  return ctx;
}

