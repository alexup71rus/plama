import type { OllamaModel } from '@/types/ollama';

const VISION_FAMILIES = ['clip', 'mllama'];

/** Fallback patterns when capabilities are not available from the API. */
const THINKING_MODEL_PATTERNS = [
  /deepseek-r1/i,
  /\bqwq\b/i,
  /\bqwen3\b/i,
  /phi-?4.*reason/i,
  /gemma-?3\b/i,
];

/**
 * Models that ALWAYS think — the think button should be active and locked.
 * These models output thinking content regardless of the `think` parameter.
 */
const THINKING_ONLY_PATTERNS = [
  /deepseek-r1/i,
  /\bqwq\b/i,
  /\bgpt-oss\b/i,
  // qwen3 base (NOT instruct) — always thinks
  /\bqwen3\b(?!.*instruct)/i,
];

export function isVisionModel(model: OllamaModel | undefined | null): boolean {
  if (model?.capabilities?.length) {
    return model.capabilities.includes('vision');
  }
  if (!model?.details?.families) return false;
  return model.details.families.some(f => VISION_FAMILIES.includes(f.toLowerCase()));
}

export function isThinkingModel(model: OllamaModel | undefined | null): boolean {
  if (!model) return false;
  if (model.capabilities?.length) {
    return model.capabilities.includes('thinking');
  }
  return THINKING_MODEL_PATTERNS.some(pattern => pattern.test(model.name));
}

/**
 * Returns true when the model always produces thinking output (cannot be toggled off).
 */
export function isThinkingOnlyModel(model: OllamaModel | undefined | null): boolean {
  if (!model) return false;
  return THINKING_ONLY_PATTERNS.some(pattern => pattern.test(model.name));
}

/**
 * Returns true when the model supports adjustable thinking budget (low/medium/high).
 * Currently this applies to models that use the separate `thinking` field format
 * and are not legacy tag-based thinkers (deepseek-r1, qwq).
 */
export function hasBudgetThinking(model: OllamaModel | undefined | null): boolean {
  if (!model) return false;

  // Keep this intentionally conservative: only enable the budget UI for models
  // we have verified accept think levels ('low' | 'medium' | 'high').
  // Today that is gpt-oss; other thinking models may only support boolean on/off.
  if (!isThinkingModel(model)) return false;
  return /\bgpt-oss\b/i.test(model.name);
}
