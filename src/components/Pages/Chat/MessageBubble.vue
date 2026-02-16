<script lang="ts" setup>
import type { Message } from '@/types/chats';
import { useChatStore } from '@/stores/chat';
import { useAlert } from '@/plugins/alertPlugin';
import { computed, onMounted, ref } from 'vue';
import 'highlight.js/styles/default.css';
import { parseMarkdown } from '@/utils/markdown';
import { useCopyCode } from '@/composables/useCopyCode';
import { copyToClipboard } from '@/utils/chatUtils';
import AttachmentChip from '@/components/Pages/Chat/AttachmentChip.vue';
import ThinkPreview from '@/components/Pages/Chat/ThinkPreview.vue';
import { useMemoryStore } from '@/stores/memory.ts';

const props = defineProps<{
    message: Message;
  }>();

  const chat = useChatStore();
  const memory = useMemoryStore();
  const { showSnackbar } = useAlert();
  const bubbleRef = ref();
  const isEditDialogOpen = ref(false);
  const editedContent = ref('');
  const isSummaryLoading = ref(false);

  useCopyCode(bubbleRef, showSnackbar);

  const parsedContent = computed(() => {
    return parseMarkdown(props.message.content);
  });

  const copyCodeBlock = async (code: string) => {
    await navigator.clipboard.writeText(code);
    showSnackbar({ message: 'Code copied!', type: 'success' });
  };

  const openEditDialog = () => {
    editedContent.value = props.message.content;
    isEditDialogOpen.value = true;
  };

  const saveEditedMessage = async (makeResend = false) => {
    if (!editedContent.value.trim()) {
      showSnackbar({ message: 'Text cannot be empty', type: 'warning' });
      return;
    }

    try {
      isEditDialogOpen.value = false;
      await chat.editMessage(chat.activeChatId, props.message.id, editedContent.value, makeResend && props.message.role === 'user');
      showSnackbar({ message: 'Message updated', type: 'success' });
    } catch (error) {
      showSnackbar({ message: 'Failed to update message', type: 'error' });
      console.error('saveEditedMessage error:', error);
    }
  };

  const closeEditDialog = () => {
    isEditDialogOpen.value = false;
  };

  onMounted(() => {
    bubbleRef.value.addEventListener('click', async (ev: MouseEvent) => {
      const target = ev.target as HTMLElement;

      if (target.classList.contains('copy-button')) {
        const block = target.parentElement;

        if (block) {
          const codeElement = block.querySelector('code');
          if (codeElement) {
            const code = codeElement.innerText.replace(/^\d+\s+/gm, '');
            await copyCodeBlock(code);
          }
        }
      }
    });
  });

  const deleteMessage = async () => {
    const chatId = chat.activeChatId;
    if (!chatId) return;

    try {
      await chat.deleteMessage(chatId, props.message.id);
      showSnackbar({ message: 'Message deleted', type: 'success' });
    } catch (error) {
      showSnackbar({ message: 'Failed to delete message', type: 'error' });
      console.error('deleteMessage error:', error);
    }
  };

  const regenerateMessage = async () => {
    const _chat = chat.activeChat;
    if (!_chat) return;

    try {
      chat.setIsSending(true);
      await chat.regenerateMessage(_chat.id, props.message.id);
      showSnackbar({ message: 'Message regenerated', type: 'success' });
    } catch (error) {
      showSnackbar({ message: 'Failed to regenerate message', type: 'error' });
      console.error('regenerateMessage error:', error);
    } finally {
      chat.setIsSending(false);
    }
  };

  const saveSummary = async () => {
    const chatId = chat.activeChatId;
    if (!chatId) return;

    try {
      isSummaryLoading.value = true;
      const activeChat = chat.chats.find(chat => chat.id === chatId) ?? null;

      if (!activeChat) {
        showSnackbar({ message: `Chat with ID ${chatId} not found`, type: 'warning' });
        return;
      }

      const messageIndex = activeChat.messages.findIndex(
        message => message.id === props.message.id
      );

      if (messageIndex === -1) {
        showSnackbar({ message: `Message with ID ${props.message.id} not found in chat`, type: 'warning' });
        return;
      }

      const recentMessages = activeChat.messages
        .filter(message => message.role === 'user')
        .slice(-4);

      const result = await memory.fetchSummary(recentMessages);

      if (!result) {
        showSnackbar({
          message: 'Nothing to save',
          type: 'warning',
        });
        return;
      }

      const confirmed = await new Promise<boolean>(resolve => {
        showSnackbar({
          message: `Do you want to save "${result}"?`,
          type: 'info',
          actions: {
            Yes: () => resolve(true),
            No: () => resolve(false),
          },
        });
      });

      if (!confirmed) {
        showSnackbar({ message: 'Summary not saved', type: 'warning' });
        return;
      }

      await memory.saveSummary(result);
      showSnackbar({
        message: 'Memory updated',
        type: 'success',
      });
    } catch (error) {
      showSnackbar({ message: 'Error processing summary', type: 'error' });
      console.error('saveSummary error:', error);
    } finally {
      isSummaryLoading.value = false;
    }
  };
</script>

<template>
  <div ref="bubbleRef" class="message-bubble" :class="message.role">
    <AttachmentChip
      v-if="message.attachmentMeta"
      :content="message.attachmentContent || ''"
      :meta="message.attachmentMeta"
    />
    <ThinkPreview v-if="message.thinkTime !== undefined" :message="message" />
    <div class="content" v-html="parsedContent" />
    <div v-if="false" class="attachments-scroll">
      <div class="attachment" />
    </div>
  </div>
  <div
    v-if="message.role === 'user'"
    :class="['actions', 'actions--user', { disabled: message.isLoading }]"
  >
    <v-btn icon="mdi-content-copy" size="small" variant="text" @click="copyToClipboard(message.content)" />
    <v-btn icon="mdi-pencil" size="small" variant="text" @click="openEditDialog" />
    <v-btn
      color="red"
      icon="mdi-delete"
      size="small"
      variant="text"
      @click="deleteMessage"
    />
  </div>
  <div v-else :class="['actions', { disabled: message.isLoading }]">
    <v-btn icon="mdi-pencil" size="small" variant="text" @click="openEditDialog" />
    <v-btn icon="mdi-autorenew" size="small" variant="text" @click="regenerateMessage" />
    <v-btn icon="mdi-content-copy" size="small" variant="text" @click="copyToClipboard(message.content)" />
    <v-btn
      :disabled="isSummaryLoading"
      icon="mdi-content-save"
      :loading="isSummaryLoading"
      size="small"
      variant="text"
      @click="saveSummary"
    />
  </div>

  <v-dialog v-model="isEditDialogOpen" max-width="800px">
    <v-card>
      <v-card-title>Edit Message</v-card-title>
      <v-card-text>
        <v-textarea
          v-model="editedContent"
          auto-grow
          class="edit-textarea"
          hide-details
          label="Message Text"
          rows="5"
          variant="outlined"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn v-if="message.role === 'user'" color="primary" text @click="saveEditedMessage(true)">Save and Resend</v-btn>
        <v-btn color="primary" text @click="saveEditedMessage()">Save</v-btn>
        <v-btn text @click="closeEditDialog">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style lang="scss" scoped>
.message-bubble {
  max-width: 80%;
  padding: 12px 16px;
  border-radius: 18px;
  margin-bottom: 8px;
  position: relative;
  word-wrap: break-word;

  &.user {
    margin-left: auto;
    background-color: var(--user-message-bg, #007AFF);
    color: var(--user-message-text, white);
    border-bottom-right-radius: 4px;

    ::v-deep(a) {
      color: var(--user-message-text, #c0e2fd);
    }
  }

  &.assistant {
    align-self: flex-start;
    background-color: var(--assistant-message-bg, #F2F2F7);
    color: var(--assistant-message-text, black);
    border-bottom-left-radius: 4px;

    ::v-deep(a) {
      color: var(--user-message-text, #007AFF);
    }
  }

  ::v-deep(.v-chip) {
    margin-bottom: 6px;
  }

  .content {
    white-space: pre-wrap;
  }

  ::v-deep(details.internal-context) {
    margin-top: 10px;
    padding: 8px 10px;
    border: 1px solid rgba(0, 0, 0, 0.12);
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.03);
  }

  ::v-deep(details.internal-context > summary) {
    cursor: pointer;
    font-weight: 600;
    user-select: none;
  }

  ::v-deep(details.internal-context > pre) {
    margin-top: 8px;
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 12px;
    line-height: 1.35;
  }

  .attachments-scroll {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    margin-top: 8px;
    padding-bottom: 4px;

    .attachment {
      flex: 0 0 auto;
      width: 100px;
      height: 100px;
      border-radius: 6px;
      background: rgba(0, 0, 0, 0.05);
    }
  }

  ::v-deep(hidden) {
    display: none;
  }
}

.actions {
  &--user {
    text-align: right;
  }

  &.disabled {
    opacity: 0.5;
    pointer-events: none;
  }
}

:deep(.content) {
  display: flex;
  flex-direction: column;
  gap: 4px;

  ol,
  ul {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-left: 20px;
    margin: 4px 0 6px;
  }

  > pre:not(:last-child) {
    margin-bottom: 10px;
  }

  .hljs {
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 5px;
    background: #1a1b20;
    color: #ffffff;
    border-radius: 10px;

    &:not(:last-child) {
      margin-bottom: 10px;
    }
  }

  .code-block-wrapper {
    display: flex;
    flex-direction: column;
    position: relative;
    font-size: 12px;

    .copy-button {
      position: absolute;
      top: 4px;
      right: 4px;
      font-size: 12px;
      padding: 4px 8px;
      cursor: pointer;
      z-index: 1;
    }

    .code-line {
      display: flex;
    }

    .line-number {
      width: 2em;
      text-align: right;
      padding-right: 1em;
      user-select: none;
      opacity: 0.5;
    }

    .line-content {
      flex: 1;
    }
  }
}

:deep(.edit-textarea .v-field__field) {
  max-height: 300px;
  overflow: auto;
}
</style>
