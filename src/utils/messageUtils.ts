import { type Attachment, AttachmentType } from '@/types/chats.ts';
import type { ISettings } from '@/types/settings.ts';

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

function stripInternalContextBlocks(content: string): string {
  if (!content) return '';
  // Remove UI-only internal context blocks we store in the user message for display.
  // They are not meant to be sent back to the model as part of history.
  return content
    .replace(
      /<details\s+class="internal-context"[^>]*>[\s\S]*?<\/details>/gi,
      '',
    )
    .trim();
}

function mergeConsecutiveRoles(messages: ChatMessage[]): ChatMessage[] {
  const merged: ChatMessage[] = [];
  for (const msg of messages) {
    const content = msg.content ?? '';
    if (!content.trim()) continue;

    const prev = merged[merged.length - 1];
    if (prev && prev.role === msg.role) {
      prev.content = [prev.content, content].filter(Boolean).join('\n\n');
    } else {
      merged.push({ role: msg.role, content });
    }
  }
  return merged;
}

export function buildOllamaRequestBody (
  chat: { systemPrompt?: { content: string } | string | null; messages: any[] },
  selectedModel: string,
  userMessageId: string,
  finalContent: string,
  attachmentContent: Attachment | null | undefined,
  memoryContent: string | null | undefined,
  settings: ISettings,
  options?: { think?: boolean | string }
) {
  const hasAttachment = !!(attachmentContent && Object.keys(attachmentContent).length);

  if (!chat || !chat.messages) {
    throw new Error('Invalid chat object');
  }

  if (!selectedModel) {
    throw new Error('No model selected');
  }

  if (!userMessageId) {
    throw new Error('Invalid user message ID');
  }

  const maxMessages = settings.maxMessages || 20;
  const systemPromptContent =
    typeof chat.systemPrompt === 'string' ? chat.systemPrompt : chat.systemPrompt?.content;

  const reservedSlots = (systemPromptContent || memoryContent ? 1 : 0) + 1;
  const availableSlots = Math.max(0, maxMessages - reservedSlots);

  if (hasAttachment && attachmentContent!.type === AttachmentType.IMAGE) {
    if (!attachmentContent!.content) {
      throw new Error('Invalid image attachment content');
    }
    return {
      body: {
        model: selectedModel,
        prompt: [
          systemPromptContent,
          memoryContent,
          finalContent,
        ].filter(Boolean).join('\n'),
        images: [attachmentContent!.content],
        stream: true,
        ...(options?.think !== undefined ? { think: options.think } : {}),
      },
      images: [attachmentContent!.content],
    };
  }

  const systemContent = [systemPromptContent, memoryContent].filter(Boolean).join('\n');

  const messages: any[] = [];
  if (systemContent) {
    messages.push({ role: 'system', content: systemContent });
  }

  const userMessageExists = chat.messages.some(msg => msg.id === userMessageId);
  if (!userMessageExists) {
    throw new Error('User message not found in chat');
  }

  const filteredMessages = chat.messages
    .filter(msg => msg.id !== userMessageId && msg.role !== 'system')
    .slice(-availableSlots)
    .map(msg => ({
      role: msg.role,
      content: stripInternalContextBlocks(msg.content),
    }));

  messages.push(...filteredMessages);
  messages.push({
    role: 'user',
    content: finalContent || '',
  });

  const normalized = mergeConsecutiveRoles(messages as ChatMessage[]);

  return {
    body: {
      model: selectedModel,
      messages: normalized,
      stream: true,
      ...(options?.think !== undefined ? { think: options.think } : {}),
    },
    images: undefined,
  };
}
