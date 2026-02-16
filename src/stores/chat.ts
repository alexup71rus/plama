import { defineStore } from 'pinia';
import { useHttpService } from '@/plugins/httpPlugin';
import {
  clearAllChats,
  deleteChat,
  deleteMessage,
  fetchLinkContent,
  loadChatMessages,
  loadChats,
  replaceChatMessages,
  saveChat,
  saveChatMeta,
  saveMessage,
  searchBackend,
  searchRagFiles,
  waitForBackend,
} from '@/api/chats';
import { type OllamaModel, type OllamaTagsResponse } from '@/types/ollama.ts';
import { type Attachment, AttachmentType, type Chat, type ChatMeta, type Message } from '@/types/chats.ts';
import {
  createThrottledFunction,
  extractLinks,
  extractStringFromResponse,
  findById,
  handleError,
  processStream,
} from '@/utils/helpers.ts';
import { type ISettings, type SystemPrompt } from '../types/settings.ts';
import { useSettingsStore } from '@/stores/settings.ts';
import { useMemoryStore } from '@/stores/memory.ts';
import type { SearchResultItem } from '../../backend/src/search/search.service.ts';
import { buildOllamaRequestBody } from '@/utils/messageUtils.ts';
import { formatFileSize } from '@/utils/chatUtils.ts';

const throttledSaveChat = createThrottledFunction(saveChat, 2000);
const throttledSaveMessage = createThrottledFunction(saveMessage, 800);
const throttledSaveChatMeta = createThrottledFunction(saveChatMeta, 800);
const throttledReplaceChatMessages = createThrottledFunction(replaceChatMessages, 800);

export const useChatStore = defineStore('chat', {
  state: () => {
    const { http } = useHttpService();
    const { settings } = useSettingsStore();
    const memory = useMemoryStore();

    return {
      http,
      settings: settings as ISettings,
      memory,
      connectionStatus: 'disconnected' as 'connected' | 'disconnected' | 'checking',
      lastConnectionCheck: 0,
      models: [] as OllamaModel[],
      chats: [] as Chat[],
      activeChatId: '',
      activeChat: null as Chat | null,
      isGeneratingTitle: false,
      isSearchActive: settings.isSearchAsDefault,
      isSending: false,
      abortController: null as AbortController | null,
      loading: false,
      error: null as string | null,
    };
  },
  getters: {
    selectedModel: state => state.settings.selectedModel || state.settings.systemModel || state.models[0]?.name || '',
  },
  actions: {
    async syncActiveChat () {
      const chat = this.chats.find(chat => chat.id === this.activeChatId);
      if (chat) {
        this.activeChat = { ...chat, messages: [...(chat.messages || [])] };
      } else {
        this.activeChat = null;
      }
    },

    async checkOllamaConnection () {
      this.error = null;
      await this.fetchModels();
      this.connectionStatus = this.error === 'Network Error' ? 'disconnected' : 'connected';
      this.lastConnectionCheck = Date.now();
      this.models = this.connectionStatus === 'connected' ? this.models : [];
      return this.connectionStatus === 'connected';
    },

    async fetchChats () {
      this.loading = true;
      try {
        await waitForBackend();
        const chats = await loadChats();
        this.chats = chats.map(chat => ({
          ...chat,
          systemPrompt: chat.systemPrompt || null,
          messages: [],
        }));
        this.syncActiveChat();
      } catch (err) {
        this.error = handleError(err, 'Failed to load chats');
      } finally {
        this.loading = false;
      }
    },

    fetchChatById(chat: Chat) {
      const exists = this.chats.find(c => c.id === chat.id);
      if (!exists) {
        this.chats.unshift({
          ...chat,
          messages: [],
        });
        this.chats.sort((a, b) => b.timestamp - a.timestamp);
        this.syncActiveChat();
      }
    },

    async fetchChatMessages (chatId: string) {
      this.loading = true;
      try {
        const messages = await loadChatMessages(chatId);
        const chat = this.chats.find(c => c.id === chatId);
        if (chat) {
          chat.messages = messages;
          this.syncActiveChat();
        }
      } catch (err) {
        this.error = handleError(err, `Failed to load messages for chat ${chatId}`);
      } finally {
        this.loading = false;
      }
    },

    async persistChat (chatId: string) {
      const chat = this.chats.find(c => c.id === chatId);
      if (chat) {
        try {
          await throttledSaveChat(chat);
        } catch (error) {
          this.error = handleError(error, 'Failed to persist chat');
          throw error;
        }
      }
    },

    async persistMessage (chatId: string, message: Message) {
      try {
        await throttledSaveMessage(chatId, message);
      } catch (error) {
        this.error = handleError(error, 'Failed to persist message');
        throw error;
      }
    },

    async persistChatMessages (chatId: string) {
      const chat = this.chats.find(c => c.id === chatId);
      if (chat) {
        try {
          await throttledReplaceChatMessages(chatId, chat.messages);
        } catch (error) {
          this.error = handleError(error, 'Failed to persist chat messages');
          throw error;
        }
      }
    },

    async persistChatMeta (meta: ChatMeta) {
      try {
        await throttledSaveChatMeta(meta);
      } catch (error) {
        this.error = handleError(error, 'Failed to persist chat meta');
        throw error;
      }
    },

    shouldGenerateTitle (chat: Chat): boolean {
      return !chat.title || chat.title === this.settings.defaultChatTitle;
    },

    setIsSending (value: boolean) {
      this.isSending = value;
    },

    async createChat () {
      const newChat: Chat = {
        id: crypto.randomUUID(),
        title: this.settings.defaultChatTitle,
        messages: [],
        timestamp: Date.now(),
        systemPrompt: this.settings.defaultSystemPrompt.content,
      };
      this.chats.unshift(newChat);
      this.activeChatId = newChat.id;
      await this.persistChat(newChat.id);
      this.syncActiveChat();
      return newChat;
    },

    async setSystemPrompt (chatId: string, systemPrompt: SystemPrompt | null) {
      const chat = this.chats.find(c => c.id === chatId);
      if (chat) {
        chat.systemPrompt = systemPrompt ? systemPrompt.content : null;
        await this.persistChatMeta({ id: chatId, systemPrompt: chat.systemPrompt });
        this.syncActiveChat();
      }
    },

    async deleteChat (chatId: string) {
      this.loading = true;
      try {
        await deleteChat(chatId);
        this.chats = this.chats.filter(c => c.id !== chatId);
        if (this.activeChatId === chatId) {
          this.activeChatId = this.chats[0]?.id || (await this.createChat()).id;
          this.syncActiveChat();
        }
      } catch (err) {
        this.error = handleError(err, 'Failed to delete chat');
        throw err;
      } finally {
        this.loading = false;
      }
    },

    async clearChats () {
      this.loading = true;
      try {
        await clearAllChats();
        this.chats = [];
        this.activeChatId = (await this.createChat()).id;
        this.syncActiveChat();
      } catch (err) {
        this.error = handleError(err, 'Error clearing chats');
        throw err;
      } finally {
        this.loading = false;
      }
    },

    async renameChat (chatId: string, newTitle: string) {
      const chat = findById(this.chats, chatId);
      if (chat) {
        chat.title = newTitle;
        await this.persistChatMeta({ id: chatId, title: newTitle });
        this.syncActiveChat();
      }
    },

    async addMessage (chatId: string, message: Omit<Message, 'id'>, attachment?: { content: string; type: AttachmentType; timestamp: number; meta: File }) {
      const chat = findById(this.chats, chatId);
      if (!chat) return null;

      if (message.role !== 'user' && message.role !== 'assistant') {
        return null;
      }

      const newMessage: Message = {
        ...message,
        id: crypto.randomUUID(),
        timestamp: message.timestamp ?? Date.now(),
        ...(attachment && {
          attachmentMeta: {
            type: attachment.type,
            name: attachment.meta.name,
            size: attachment.meta.size,
            lastModified: attachment.meta.lastModified,
          },
          attachmentContent: attachment.content,
        }),
      };

      chat.messages.push(newMessage);
      chat.timestamp = Date.now();
      this.chats.sort((a, b) => b.timestamp - a.timestamp);
      await this.syncActiveChat();

      return newMessage.id;
    },

    async updateMessage (chatId: string, messageId: string, content: string, isLoading?: boolean, thinkTime?: number, isThinking?: boolean) {
      const chat = findById(this.chats, chatId);
      const message = chat?.messages.find(m => m.id === messageId);
      if (message) {
        message.content = content;
        if (isLoading !== undefined) message.isLoading = isLoading;
        if (thinkTime !== undefined) message.thinkTime = thinkTime;
        if (isThinking !== undefined) message.isThinking = isThinking;
        await this.persistMessage(chatId, message);
        await this.syncActiveChat();
      }
    },

    async generateChatTitle (chatId: string): Promise<void> {
      const chat = findById(this.chats, chatId);
      if (!chat || chat.messages.length < 1) return;

      const generateDefaultTitle = (content?: string): string =>
        content?.split(' ').slice(0, 5).join(' ') || this.settings.defaultChatTitle;

      if (!this.settings.systemModel && !this.settings.selectedModel) {
        await this.renameChat(chatId, generateDefaultTitle(chat.messages[0]?.content));
        return;
      }

      try {
        const userMessages = chat.messages
          .filter(msg => msg.role === 'user')
          .slice(-2);
        const contextMessages = userMessages.length > 0 ? userMessages : chat.messages.slice(-1);

        const response = await this.http.request({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          url: `${this.settings.backendURL}/api/chat`,
          data: {
            model: this.settings.systemModel || this.selectedModel,
            messages: [
              { role: 'system', content: this.settings.titlePrompt },
              ...contextMessages,
              { role: 'user', content: 'Generate the title.' },
            ],
            stream: false,
          },
        });

        let newTitle = response?.message?.content?.trim();
        if (!newTitle) {
          newTitle = generateDefaultTitle(userMessages[0]?.content || chat.messages[0]?.content);
        } else {
          newTitle = extractStringFromResponse(newTitle);
          const textContent = newTitle.replace(/[\p{Emoji}]/gu, '');
          if (newTitle.length > 50 || textContent.length < 3) {
            newTitle = generateDefaultTitle(userMessages[0]?.content || chat.messages[0]?.content);
          }
        }

        await this.renameChat(chatId, newTitle);
      } catch (error) {
        await this.renameChat(chatId, generateDefaultTitle(chat.messages[0]?.content));
      }
    },

    async sendMessage (chatId: string, content: string, attachmentContent?: Attachment | null) {
      try {
        const chat = this.chats.find(c => c.id === chatId);
        if (!chat) throw new Error('No active chat');
        if (!this.models.length) throw new Error('No models available');

        if (!content.trim() && !attachmentContent) {
          throw new Error('Message content or attachment is required');
        }

        this.isSending = true;
        this.abortController?.abort();
        this.abortController = new AbortController();

        const finalContent = content.trim() || '';
        let userMessageId: string | null = null;
        let searchResults: SearchResultItem[] | null = null;
        let linkContent: { urls: string[]; content?: string; error?: string } | null = null;
        let textFileContent: { content: string; meta: { name: string; size: number } } | null = null;
        const hasAttachment = !!(attachmentContent && Object.keys(attachmentContent).length);
        let generatedSearchQuery: string | null = null;

        const escapeHtml = (value: string): string =>
          value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

        const truncateText = (value: string, maxChars: number): string => {
          if (!value) return '';
          if (value.length <= maxChars) return value;
          return value.slice(0, Math.max(0, maxChars - 1)) + '…';
        };

        const toDetailsBlock = (title: string, body: string): string => {
          const safeTitle = escapeHtml(title);
          const safeBody = escapeHtml(body);
          return `<details class="internal-context"><summary>${safeTitle}</summary><pre>${safeBody}</pre></details>`;
        };

        const urls = extractLinks(finalContent);
        if (urls?.length) {
          try {
            const result = await fetchLinkContent(urls);
            linkContent = { urls, content: result.content, error: result.error };
          } catch (error) {
            linkContent = { urls, error: 'Failed to fetch link content' };
          }
        }

        if (this.isSearchActive) {
          try {
            const searchModel = this.settings.searchModel || this.selectedModel || this.settings.systemModel;
            if (!searchModel) throw new Error('No search model available');

            const searchQueryResponse = await this.http.request({
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              url: `${this.settings.backendURL}/api/chat`,
              data: {
                model: searchModel,
                messages: [
                  { role: 'system', content: this.settings.searchPrompt },
                  { role: 'user', content: finalContent },
                ],
                stream: false,
              },
            });

            generatedSearchQuery = searchQueryResponse?.message?.content?.trim() ?? null;
            if (!generatedSearchQuery) throw new Error('Failed to generate search query');

            searchResults = await searchBackend(
              generatedSearchQuery,
              this.settings.searxngURL,
              this.settings.searchFormat,
              {
                searchResultsLimit: this.settings.searchResultsLimit,
                followSearchLinks: this.settings.followSearchLinks,
              }
            );
          } catch (error) {
            searchResults = null;
          }
        }

        let ragContext: string = '';
        if (this.settings.selectedRagFiles?.length) {
          const ragResults = await searchRagFiles(
            finalContent,
            this.settings.selectedRagFiles,
            this.settings.ollamaURL,
            this.settings.embeddingsModel || this.selectedModel,
            3
          );
          ragContext = ragResults
            .map(result => `[Document: ${result.filename}, Similarity: ${result.similarity.toFixed(2)}]\n${result.text}`)
            .join('\n\n');
        }

        // Build context blocks:
        // - UI: collapsible <details> blocks
        // - Model: plain text appended to current user message (keeps roles alternating)
        let contextForUi = '';
        let contextForModel = '';

        if (hasAttachment && attachmentContent?.content && attachmentContent?.meta?.name && attachmentContent.type === AttachmentType.TEXT) {
          textFileContent = { content: attachmentContent.content, meta: { name: attachmentContent.meta.name, size: attachmentContent.meta.size } };
          const title = `Вложение: ${textFileContent.meta.name} (${formatFileSize(textFileContent.meta.size)})`;
          const body = truncateText(textFileContent.content, 3000);
          contextForUi += `\n\n${toDetailsBlock(title, body)}`;
          contextForModel += `\n\n[Attachment]\nName: ${textFileContent.meta.name}\nSize: ${formatFileSize(textFileContent.meta.size)}\n${body}`;
        }

        if (this.isSearchActive && searchResults?.length) {
          // searchBackend already returns bounded results; still keep a conservative cap.
          const raw = JSON.stringify(searchResults, null, 2);
          const body = truncateText(raw, 6000);
          const title = `Поиск по запросу: ${truncateText(generatedSearchQuery || finalContent.trim(), 80)}`;
          contextForUi += `\n\n${toDetailsBlock(title, body)}`;
          contextForModel += `\n\n[Search Results]\n${body}`;
        }

        if (linkContent) {
          const raw = JSON.stringify({ content: linkContent.content ?? {}, error: linkContent.error ?? null }, null, 2);
          const body = truncateText(raw, 6000);
          const title = `Ссылки (${linkContent.urls.length})`;
          contextForUi += `\n\n${toDetailsBlock(title, body)}`;
          contextForModel += `\n\n[Link Content]\n${body}`;
        }

        if (ragContext) {
          const body = truncateText(ragContext, 6000);
          const title = 'RAG';
          contextForUi += `\n\n${toDetailsBlock(title, body)}`;
          contextForModel += `\n\n[RAG Context]\n${body}`;
        }

        const finalContentForUi = (finalContent + contextForUi).trim();
        const finalContentForModel = (finalContent + contextForModel).trim();

        userMessageId = await this.addMessage(chatId, {
          role: 'user',
          content: finalContentForUi,
          timestamp: Date.now(),
          attachmentContent: attachmentContent?.content || null,
          attachmentMeta: attachmentContent?.meta ? {
            type: attachmentContent.type,
            name: attachmentContent.meta.name,
            size: attachmentContent.meta.size,
            lastModified: attachmentContent.meta.lastModified,
          } : null,
        });

        if (!userMessageId) {
          throw new Error('Failed to add user message');
        }

        await this.persistChatMessages(chatId);
        await this.persistChatMeta({ id: chatId, timestamp: chat.timestamp });
        await this.syncActiveChat();

        const { body, images } = buildOllamaRequestBody(
          chat,
          this.selectedModel,
          userMessageId,
          finalContentForModel,
          attachmentContent,
          this.memory.getMemoryContent,
          this.settings
        );

        const response = await fetch(`${this.settings.backendURL}/api/${hasAttachment && attachmentContent?.type === AttachmentType.IMAGE ? 'generate' : 'chat'}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: this.abortController.signal,
        });

        let thinkStartTime: number | null = null;
        let isInThinkBlock = false;
        let thinkTagBuffer = '';
        let assistantMessageId: string | null = null;
        let assistantContent = '';
        let thinkTimeInterval: number | null = null;

        const THINK_OPEN_TAGS = ['<think>', '<analysis>'];
        const THINK_CLOSE_TAGS = ['</think>', '</analysis>'];

        const updateThinkStateFromChunk = (chunk: string) => {
          // Tags can be split across streamed chunks; keep a small rolling buffer.
          thinkTagBuffer = (thinkTagBuffer + chunk).slice(-64);

          const combined = thinkTagBuffer;
          if (!isInThinkBlock && THINK_OPEN_TAGS.some(t => combined.includes(t))) {
            thinkStartTime = Date.now();
            isInThinkBlock = true;
            startThinkTimeUpdates();
          }

          if (isInThinkBlock && THINK_CLOSE_TAGS.some(t => combined.includes(t))) {
            isInThinkBlock = false;
            if (thinkTimeInterval) clearInterval(thinkTimeInterval);
            thinkTimeInterval = null;
          }
        };

        const startThinkTimeUpdates = () => {
          if (thinkTimeInterval) clearInterval(thinkTimeInterval);
          thinkTimeInterval = setInterval(async () => {
            if (isInThinkBlock && thinkStartTime && assistantMessageId) {
              await this.updateMessage(chatId, assistantMessageId, assistantContent, true, Date.now() - thinkStartTime, true);
            }
          }, 100);
        };

        const cleanup = () => {
          if (thinkTimeInterval) clearInterval(thinkTimeInterval);
          if (assistantMessageId && isInThinkBlock) {
            this.updateMessage(chatId, assistantMessageId, assistantContent, false, thinkStartTime ? Date.now() - thinkStartTime : undefined, false);
          }
        };

        this.abortController.signal.addEventListener('abort', cleanup);

        await processStream(response, async data => {
          const chunkContent = hasAttachment && attachmentContent?.type === AttachmentType.IMAGE ? data.response : data.message?.content;
          if (!chunkContent) return;

          updateThinkStateFromChunk(chunkContent);

          assistantMessageId ??= await this.addMessage(chatId, {
            role: 'assistant',
            content: '',
            isLoading: true,
            thinkTime: thinkStartTime && isInThinkBlock ? Date.now() - thinkStartTime : undefined,
            isThinking: isInThinkBlock,
            timestamp: Date.now(),
          });
          assistantContent += chunkContent;
          await this.updateMessage(chatId, assistantMessageId!, assistantContent, true, thinkTimeInterval && isInThinkBlock ? Date.now() - thinkStartTime : undefined, isInThinkBlock);
        });

        if (assistantMessageId) {
          const finalThinkTime = isInThinkBlock && thinkStartTime ? Date.now() - thinkStartTime : findById(chat.messages, assistantMessageId)?.thinkTime;
          if (thinkTimeInterval) clearInterval(thinkTimeInterval);
          await this.updateMessage(chatId, assistantMessageId, assistantContent, false, finalThinkTime, false);
          await this.persistChatMessages(chatId);
          await this.syncActiveChat();
        }

        if (chat && this.shouldGenerateTitle(chat)) {
          this.isGeneratingTitle = true;
          await this.generateChatTitle(chatId);
          this.isGeneratingTitle = false;
        }

        this.chats.sort((a, b) => b.timestamp - a.timestamp);
        await this.syncActiveChat();
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          this.error = handleError(error, 'Failed to stream message from Ollama');
          throw error;
        }
      } finally {
        this.isSending = false;
        this.abortController = null;
      }
    },

    async editMessage (chatId: string, messageId: string, newContent: string, dropFollowing: boolean = false) {
      const chat = findById(this.chats, chatId);
      if (!chat) {
        this.error = 'Chat not found';
        return;
      }

      try {
        const index = chat.messages.findIndex(m => m.id === messageId);
        if (index === -1) {
          this.error = 'Message not found';
          return;
        }

        const message = chat.messages[index];
        if (message.role !== 'user') {
          this.error = 'Cannot edit non-user message';
          return;
        }

        if (dropFollowing) {
          const cachedContent = newContent;
          const cachedAttachmentMeta = message.attachmentMeta;
          const cachedAttachmentContent = message.attachmentContent;

          const messageIdsToDelete = chat.messages.slice(index).map(m => m.id);
          chat.messages = chat.messages.slice(0, index);
          chat.timestamp = Date.now();
          this.chats.sort((a, b) => b.timestamp - a.timestamp);

          await deleteMessage(chatId, messageIdsToDelete);
          await this.persistChatMessages(chatId);
          await this.persistChatMeta({ id: chatId, timestamp: chat.timestamp });
          await this.syncActiveChat();

          await this.sendMessage(chatId, cachedContent, cachedAttachmentMeta && cachedAttachmentContent ? {
            content: cachedAttachmentContent,
            type: cachedAttachmentMeta.type,
            meta: {
              name: cachedAttachmentMeta.name,
              size: cachedAttachmentMeta.size,
              lastModified: cachedAttachmentMeta.lastModified,
            } as File,
          } : null);
        } else {
          message.content = newContent;
          await this.persistMessage(chatId, message);
          await this.syncActiveChat();
        }
      } catch (error) {
        this.error = handleError(error, 'Failed to edit message');
        throw error;
      }
    },

    async deleteMessage (chatId: string, messageId: string) {
      const chat = findById(this.chats, chatId);
      if (!chat) {
        this.error = 'Chat not found';
        return;
      }

      try {
        const index = chat.messages.findIndex(m => m.id === messageId);
        if (index === -1) {
          this.error = 'Message not found';
          return;
        }

        const messageIdsToDelete = chat.messages.slice(index).map(m => m.id);
        chat.messages = chat.messages.slice(0, index);
        chat.timestamp = Date.now();
        this.chats.sort((a, b) => b.timestamp - a.timestamp);

        await deleteMessage(chatId, messageIdsToDelete);
        await this.persistChatMessages(chatId);
        await this.persistChatMeta({ id: chatId, timestamp: chat.timestamp });
        await this.syncActiveChat();
      } catch (error) {
        this.error = handleError(error, 'Failed to delete message and subsequent messages');
        throw error;
      }
    },

    async regenerateMessage (chatId: string, messageId: string) {
      const chat = findById(this.chats, chatId);
      if (!chat) {
        this.error = 'Chat not found';
        return;
      }

      try {
        const index = chat.messages.findIndex(m => m.id === messageId);
        if (index === -1 || chat.messages[index].role !== 'assistant') {
          this.error = 'Assistant message not found';
          return;
        }
        if (index === 0 || chat.messages[index - 1].role !== 'user') {
          this.error = 'No preceding user message found';
          return;
        }

        const prevMessage = chat.messages[index - 1];
        const cachedContent = prevMessage.content;
        const cachedAttachmentMeta = prevMessage.attachmentMeta;
        const cachedAttachmentContent = prevMessage.attachmentContent;

        const messageIdsToDelete = chat.messages.slice(index - 1).map(m => m.id);
        chat.messages = chat.messages.slice(0, index - 1);
        chat.timestamp = Date.now();
        this.chats.sort((a, b) => b.timestamp - a.timestamp);

        await deleteMessage(chatId, messageIdsToDelete);
        await this.persistChatMessages(chatId);
        await this.persistChatMeta({ id: chatId, timestamp: chat.timestamp });
        await this.syncActiveChat();

        await this.sendMessage(chatId, cachedContent, cachedAttachmentMeta && cachedAttachmentContent ? {
          content: cachedAttachmentContent,
          type: cachedAttachmentMeta.type,
          meta: {
            name: cachedAttachmentMeta.name,
            size: cachedAttachmentMeta.size,
            lastModified: cachedAttachmentMeta.lastModified,
          } as File,
        } : null);
      } catch (error) {
        this.error = handleError(error, 'Failed to regenerate message');
        throw error;
      }
    },

    async fetchModels () {
      try {
        const response = await this.http.request<OllamaTagsResponse>({
          method: 'GET',
          url: `${this.settings.backendURL}/api/tags`,
        });
        this.models = response.models || [];
        return this.models;
      } catch (error) {
        this.models = [];
        this.error = handleError(error, 'Failed to fetch models');
        return [];
      }
    },
  },
});
