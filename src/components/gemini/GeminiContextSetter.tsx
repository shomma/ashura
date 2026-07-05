'use client';

import { useEffect } from 'react';
import { useGeminiContext } from './GeminiContext';

type Props = {
  context: string;
  contextKey?: string;
  contextLabel?: string;
};

export default function GeminiContextSetter({ context, contextKey, contextLabel }: Props) {
  const { setContextText, setContextEntry } = useGeminiContext();

  useEffect(() => {
    if (contextKey) {
      setContextEntry({ key: contextKey, label: contextLabel, text: context });
    } else {
      setContextText(context);
    }
  }, [context, contextKey, contextLabel, setContextEntry, setContextText]);

  return null;
}

