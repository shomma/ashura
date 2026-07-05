export const UI_PREFERENCES_STORAGE_KEY = 'ashura_ui_preferences_v1';

export type UiPreferences = {
  compactMainFlowGuide: boolean;
  articleDraftFocusModeByDefault: boolean;
};

export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  compactMainFlowGuide: true,
  articleDraftFocusModeByDefault: true
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeUiPreferences(value: unknown): UiPreferences {
  if (!isRecord(value)) return DEFAULT_UI_PREFERENCES;
  return {
    compactMainFlowGuide:
      typeof value.compactMainFlowGuide === 'boolean'
        ? value.compactMainFlowGuide
        : DEFAULT_UI_PREFERENCES.compactMainFlowGuide,
    articleDraftFocusModeByDefault:
      typeof value.articleDraftFocusModeByDefault === 'boolean'
        ? value.articleDraftFocusModeByDefault
        : DEFAULT_UI_PREFERENCES.articleDraftFocusModeByDefault
  };
}

export function readUiPreferences(): UiPreferences {
  if (typeof window === 'undefined') return DEFAULT_UI_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(UI_PREFERENCES_STORAGE_KEY);
    if (!raw) return DEFAULT_UI_PREFERENCES;
    return sanitizeUiPreferences(JSON.parse(raw));
  } catch {
    return DEFAULT_UI_PREFERENCES;
  }
}

export function saveUiPreferences(input: Partial<UiPreferences>): UiPreferences {
  const current = readUiPreferences();
  const next: UiPreferences = sanitizeUiPreferences({
    ...current,
    ...input
  });
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(UI_PREFERENCES_STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}
