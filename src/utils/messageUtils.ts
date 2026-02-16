import { type Attachment, AttachmentType } from '@/types/chats.ts';
import type { ISettings } from '@/types/settings.ts';

export function buildOllamaRequestBody (
  chat: { systemPrompt?: { content: string } | null; messages: any[] },
  selectedModel: string,
  userMessageId: string,
  finalContent: string,
  attachmentContent: Attachment | null | undefined,
  memoryContent: string | null | undefined,
  settings: ISettings
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
  const reservedSlots = (chat.systemPrompt?.content || memoryContent ? 1 : 0) + 1;
  const availableSlots = Math.max(0, maxMessages - reservedSlots);

  if (hasAttachment && attachmentContent!.type === AttachmentType.IMAGE) {
    if (!attachmentContent!.content) {
      throw new Error('Invalid image attachment content');
    }
    return {
      body: {
        model: selectedModel,
        prompt: [
          chat.systemPrompt?.content,
          memoryContent,
          finalContent,
        ].filter(Boolean).join('\n'),
        images: [attachmentContent!.content],
        stream: true,
      },
      images: [attachmentContent!.content],
    };
  }

  const systemContent = [chat.systemPrompt?.content, memoryContent].filter(Boolean).join('\n');

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
      content: msg.content,
    }));

  messages.push(...filteredMessages);
  messages.push({
    role: 'user',
    content: finalContent || '',
  });

  return {
    body: {
      model: selectedModel,
      messages,
      stream: true,
    },
    images: undefined,
  };
}
