export function buildContextString(data: unknown, maxChars = 6000) {
  const json = JSON.stringify(data, replacer, 2) || '';
  if (json.length <= maxChars) return json;
  return `${json.slice(0, maxChars)}\n... (truncated)`;
}

function replacer(_key: string, value: any) {
  if (Array.isArray(value)) {
    return value.slice(0, 30);
  }
  return value;
}
