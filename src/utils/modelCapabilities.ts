import type { OllamaModel } from '@/types/ollama';

const VISION_FAMILIES = ['clip', 'mllama'];

const THINKING_MODEL_PATTERNS = [
  /deepseek-r1/i,
  /\bqwq\b/i,
  /\bqwen3\b/i,
  /phi-?4.*reason/i,
  /gemma-?3\b/i,
];

export function isVisionModel(model: OllamaModel | undefined | null): boolean {
  if (!model?.details?.families) return false;
  return model.details.families.some(f => VISION_FAMILIES.includes(f.toLowerCase()));
}

export function isThinkingModel(model: OllamaModel | undefined | null): boolean {
  if (!model) return false;
  return THINKING_MODEL_PATTERNS.some(pattern => pattern.test(model.name));
}
