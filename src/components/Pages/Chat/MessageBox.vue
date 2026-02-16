<script lang="ts" setup>
  import { computed, nextTick, onMounted, ref, watch } from 'vue';
  import { useChatStore } from '@/stores/chat';
  import { type Attachment, type ChatModel } from '@/types/chats';
  import { useSettingsStore } from '@/stores/settings';
  import { useMemoryStore } from '@/stores/memory';
  import { type AttachmentContent, processFile } from '@/utils/fileProcessor';
  import { type SystemPrompt } from '@/types/settings';

  const chat = useChatStore();
  const settingsStore = useSettingsStore();
  const memory = useMemoryStore();

  const textareaRef = ref<HTMLTextAreaElement>();
  const fileInputRef = ref<HTMLInputElement>();
  const messageText = ref('');
  const attachment = ref<File | null>(null);
  const attachmentContent = ref<AttachmentContent | null>(null);
  const promptMenu = ref(false);
  const promptSearch = ref('');
  const ragMenu = ref(false);
  const ragSearch = ref('');

  const activeChat = computed(() => chat.activeChat);
  const activeChatId = computed(() => chat.activeChatId);
  const canSend = computed(() => !chat.isSending && !!messageText.value.trim());
  const modelNames = computed(() => chat.models?.map((model: ChatModel) => model.name) || []);
  const selectedModel = ref(settingsStore.settings.selectedModel || settingsStore.settings.defaultModel || settingsStore.settings.systemModel);
  const isChangedModel = computed(() => selectedModel.value !== (settingsStore.settings.defaultModel || settingsStore.settings.systemModel));
  const modelSearch = ref('');
  const filteredModels = computed(() =>
    modelSearch.value
      ? modelNames.value.filter(name => name.toLowerCase().includes(modelSearch.value.toLowerCase()))
      : modelNames.value
  );
  const ragFiles = computed(() => settingsStore.settings.ragFiles || []);
  const selectedRagFiles = computed(() => settingsStore.settings.selectedRagFiles || []);
  const isChangedRag = computed(() => selectedRagFiles.value.length > 0);
  const filteredRagFiles = computed(() =>
    ragSearch.value
      ? ragFiles.value.filter(name => name.toLowerCase().includes(ragSearch.value.toLowerCase()))
      : ragFiles.value
  );

  const showLabels = computed(() => settingsStore.settings.showToolbarLabels !== false);
  const showSendButton = computed(() => settingsStore.settings.showSendButton !== false);
  const hasVision = computed(() => chat.currentModelHasVision);
  const hasThinking = computed(() => chat.currentModelHasThinking);
  const fileAccept = computed(() =>
    hasVision.value
      ? '.png,.jpg,.jpeg,.txt,.md,.json,.xml,.csv'
      : '.txt,.md,.json,.xml,.csv'
  );

  const systemPrompts = computed(() => settingsStore.settings.systemPrompts);
  const selectedPrompt = ref<SystemPrompt | null>(activeChat.value?.systemPrompt || settingsStore.settings.defaultSystemPrompt);
  const isChatEmpty = computed(() => activeChat.value?.messages.length === 0);
  const isDefaultPrompt = computed(() => (prompt: SystemPrompt | null) => {
    if (!prompt && !settingsStore.settings.defaultSystemPrompt) return true;
    return prompt && settingsStore.settings.defaultSystemPrompt?.title === prompt.title;
  });
  const filteredPrompts = computed(() => {
    if (!promptSearch.value) {
      return [...systemPrompts.value, { title: 'No default', content: '' }];
    }
    const filtered = systemPrompts.value.filter(prompt =>
      prompt.title.toLowerCase().includes(promptSearch.value.toLowerCase())
    );
    return filtered.length > 0 ? filtered : [{ title: 'No default', content: '' }];
  });

  const setDefaultModel = () => selectedModel.value && settingsStore.updateSettings({ defaultModel: selectedModel.value });

  const selectModel = (model: string) => {
    selectedModel.value = model;
    settingsStore.updateSettings({ selectedModel: model });
  };

  const setDefaultPrompt = (prompt: SystemPrompt | null) => {
    settingsStore.updateSettings({ defaultSystemPrompt: prompt });
  };

  const selectPrompt = (prompt: SystemPrompt | null) => {
    if (activeChatId.value) {
      promptMenu.value = false;
      chat.setSystemPrompt(activeChatId.value, prompt);
      setTimeout(() => {
        selectedPrompt.value = prompt;
        promptSearch.value = prompt?.title || '';
      }, 100);
    }
  };

  const toggleRagFile = (filename: string) => {
    const currentFiles = [...selectedRagFiles.value];
    const index = currentFiles.indexOf(filename);
    if (index >= 0) {
      currentFiles.splice(index, 1);
    } else {
      currentFiles.push(filename);
    }
    settingsStore.updateSettings({ selectedRagFiles: currentFiles });
  };

  const clearRagFiles = () => {
    settingsStore.updateSettings({ selectedRagFiles: [] });
    ragMenu.value = false;
  };

  const truncateContent = (content: string) => {
    if (!content) return 'No content';
    const firstLine = content.split('\n')[0];
    return firstLine.length > 50 ? firstLine.slice(0, 50) + '...' : firstLine + (content.includes('\n') ? '...' : '');
  };

  const handleAttachClick = () => fileInputRef.value?.click();

  const handleFilesSelected = async (event: Event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const result = await processFile(file, hasVision.value);
    if (result) {
      attachmentContent.value = result;
      attachment.value = file;
    } else {
      input.value = '';
    }
  };

  const removeAttachment = () => {
    attachment.value = null;
    attachmentContent.value = null;
    if (fileInputRef.value) fileInputRef.value.value = '';
    nextTick(() => textareaRef.value?.focus());
  };

  const onFormSubmit = (event: Event) => {
    event.preventDefault();
    sendMessage();
  };

  const withSending = async (action: () => Promise<void>) => {
    chat.setIsSending(true);
    try {
      await action();
    } finally {
      chat.setIsSending(false);
    }
  };

  const sendMessage = async () => {
    if (!canSend.value) return;
    await withSending(async () => {
      await chat.sendMessage(
        activeChatId.value,
        messageText.value,
        { ...attachmentContent.value } as Attachment,
      );
      messageText.value = '';
      attachment.value = null;
      attachmentContent.value = null;
      if (fileInputRef.value) fileInputRef.value.value = '';
    });
  };

  const stopGeneration = async () => {
    if (!chat.abortController) return;
    chat.abortController.abort();
    chat.setIsSending(false);
    const lastMessage = activeChat.value?.messages[activeChat.value.messages.length - 1];
    if (lastMessage?.isLoading) {
      await chat.updateMessage(
        activeChatId.value,
        lastMessage.id,
        lastMessage.content,
        false,
        lastMessage.thinkTime,
        false
      );
    }
  };

  const handlePromptInput = (value: string) => {
    promptSearch.value = value;
    promptMenu.value = true;
  };

  const handleRagInput = (value: string) => {
    ragSearch.value = value;
    ragMenu.value = true;
  };

  const handleClear = () => {
    promptSearch.value = '';
    selectPrompt(null);
  };

  onMounted(() => {
    nextTick(() => textareaRef.value?.focus());
    if (isChatEmpty.value && !activeChat.value?.systemPrompt && settingsStore.settings.defaultSystemPrompt) {
      chat.setSystemPrompt(activeChatId.value, settingsStore.settings.defaultSystemPrompt);
      selectedPrompt.value = settingsStore.settings.defaultSystemPrompt;
      promptSearch.value = selectedPrompt.value?.title || '';
    }
  });

  watch(() => [chat.activeChatId, chat.isSending, chat.selectedModel], () => {
    nextTick(() => textareaRef.value?.focus());
  }, { deep: true });

  watch(() => activeChat.value?.systemPrompt, newPrompt => {
    selectedPrompt.value = newPrompt || settingsStore.settings.defaultSystemPrompt;
    promptSearch.value = selectedPrompt.value?.title || '';
  }, { deep: true });
</script>

<template>
  <div class="chat-input-wrapper">
    <input
      ref="fileInputRef"
      :accept="fileAccept"
      hidden
      type="file"
      @change="handleFilesSelected"
    >

    <div class="chat-input-container">
      <div v-if="isChatEmpty" class="prompt-autocomplete-wrapper">
        <div class="prompt-autocomplete-backdrop" />
        <v-menu
          v-model="promptMenu"
          :close-on-content-click="false"
          location="top"
          offset-y
        >
          <template #activator="{ props }">
            <v-text-field
              v-model="promptSearch"
              append-inner-icon="mdi-chevron-down"
              v-bind="props"
              autocomplete="off"
              class="prompt-input"
              clearable
              hide-details
              placeholder="Select system prompt"
              variant="solo-filled"
              @click:clear="handleClear"
              @input="handlePromptInput($event.target.value)"
              @keydown.enter.prevent="promptMenu = false"
            />
          </template>
          <v-card min-width="300">
            <v-card-text class="pa-2">
              <div class="prompt-list">
                <v-list-item
                  v-for="prompt in filteredPrompts"
                  :key="prompt.title"
                  :active="prompt.title === selectedPrompt?.title"
                  :class="{ 'v-list-item--active': prompt.title === selectedPrompt?.title }"
                  :subtitle="truncateContent(prompt.content)"
                  :value="prompt.title"
                  @click="selectPrompt(prompt.title === 'No default' ? null : prompt)"
                >
                  <div class="prompt-item">
                    {{ prompt.title }}
                    <v-btn
                      v-if="!isDefaultPrompt(prompt.title === 'No default' ? null : prompt)"
                      color="primary"
                      density="compact"
                      icon="mdi-check-circle"
                      variant="text"
                      @click.stop="setDefaultPrompt(prompt.title === 'No default' ? null : prompt)"
                    />
                  </div>
                </v-list-item>
              </div>
            </v-card-text>
          </v-card>
        </v-menu>
      </div>

      <v-textarea
        ref="textareaRef"
        v-model="messageText"
        auto-grow
        class="chat-input"
        density="comfortable"
        :disabled="chat.isSending || chat.models?.length === 0"
        hide-details
        placeholder="Enter a message..."
        rows="1"
        variant="solo-filled"
        @keydown.enter.exact.prevent.stop
        @keyup.enter.exact.prevent.stop="onFormSubmit"
      />
    </div>

    <div class="chat-input-actions">
      <v-menu :close-on-content-click="false" location="top">
        <template #activator="{ props }">
          <v-btn
            v-bind="props"
            append-icon="mdi-chevron-down"
            class="model-btn"
            :color="isChangedModel ? 'primary' : 'white'"
            prepend-icon="mdi-robot"
            variant="tonal"
          >
            {{ selectedModel || 'Model' }}
          </v-btn>
        </template>

        <v-card min-width="300">
          <v-card-text class="pa-2">
            <div class="autocomplete-model__list">
              <template v-if="chat.models?.length">
                <v-list-item
                  v-for="model in filteredModels"
                  :key="model"
                  :active="model === selectedModel"
                  :value="model"
                  @click="selectModel(model)"
                >
                  <div class="autocomplete-model__item" :title="model">
                    {{ model }}
                    <v-btn
                      v-if="isChangedModel && selectedModel === model"
                      v-tooltip:top="'Set as default'"
                      color="primary"
                      density="compact"
                      icon="mdi-check-circle"
                      variant="text"
                      @click="setDefaultModel"
                    />
                  </div>
                </v-list-item>
              </template>
              <v-skeleton-loader v-else :elevation="3" type="paragraph" />
            </div>

            <v-text-field
              v-model="modelSearch"
              class="mb-2"
              clearable
              dense
              hide-details
              placeholder="Filter models"
              variant="solo-filled"
            />
          </v-card-text>
        </v-card>
      </v-menu>
      <v-btn
        v-if="isChangedModel"
        class="model-btn"
        :color="'red'"
        icon="mdi-backup-restore"
        variant="tonal"
        @click="selectModel(settingsStore.settings.defaultModel || settingsStore.settings.systemModel)"
      />
      <v-spacer />
      <v-menu :close-on-content-click="false" location="top">
        <template #activator="{ props }">
          <v-btn
            v-tooltip:top="showLabels ? undefined : 'RAG Files'"
            v-bind="props"
            :append-icon="showLabels ? 'mdi-chevron-down' : undefined"
            class="rag-btn"
            :color="isChangedRag ? 'primary' : 'white'"
            :disabled="!chat.models?.length"
            :icon="!showLabels ? 'mdi-file-document' : undefined"
            :prepend-icon="showLabels ? 'mdi-file-document' : undefined"
            variant="tonal"
          >
            <span v-if="showLabels">RAG Files</span>
          </v-btn>
        </template>
        <v-card min-width="300">
          <v-card-text class="pa-2">
            <div class="autocomplete-rag__list">
              <v-list-item v-if="!ragFiles.length" disabled>
                <div class="autocomplete-rag__item">No files</div>
              </v-list-item>
              <v-list-item
                v-for="file in filteredRagFiles"
                :key="file"
                :active="selectedRagFiles.includes(file)"
                :value="file"
                @click="toggleRagFile(file)"
              >
                <div class="autocomplete-rag__item" :title="file">
                  {{ file }}
                  <v-icon
                    v-if="selectedRagFiles.includes(file)"
                    color="primary"
                    icon="mdi-check-circle"
                    size="small"
                  />
                </div>
              </v-list-item>
            </div>

            <v-text-field
              v-model="ragSearch"
              class="mb-2 mt-2"
              clearable
              dense
              hide-details
              placeholder="Filter RAG files"
              variant="solo-filled"
              @input="handleRagInput($event.target.value)"
            >
              <template #append-inner>
                <v-btn
                  class="rag-btn"
                  :color="'red'"
                  :disabled="!selectedRagFiles.length"
                  icon="mdi-backup-restore"
                  size="small"
                  variant="tonal"
                  @click="clearRagFiles"
                />
              </template>
            </v-text-field>
          </v-card-text>
        </v-card>
      </v-menu>
      <v-btn
        v-tooltip:top="!showLabels ? (attachment ? attachment.name : (hasVision ? 'Attach' : 'Attach (text only)')) : (hasVision ? undefined : 'Images not supported by this model')"
        class="file-btn"
        :color="attachment ? 'blue' : 'white'"
        :disabled="!chat.models?.length"
        :icon="!showLabels && !attachment ? 'mdi-paperclip' : undefined"
        variant="tonal"
        @click="handleAttachClick"
      >
        <template v-if="showLabels || attachment" #prepend>
          <v-icon>mdi-paperclip</v-icon>
        </template>
        <span v-if="showLabels && attachment" v-tooltip:top="attachment.name">{{ attachment.name }}</span>
        <span v-else-if="showLabels">Attach</span>
        <v-btn
          v-if="attachment"
          icon="mdi-close"
          size="small"
          variant="text"
          @click.stop="removeAttachment"
        />
      </v-btn>
      <v-btn
        v-if="hasThinking"
        v-tooltip:top="!showLabels ? (chat.isThinkActive ? 'Think: ON' : 'Think: OFF') : undefined"
        class="think-btn"
        :color="chat.isThinkActive ? 'purple' : 'white'"
        :disabled="!chat.models?.length"
        :icon="!showLabels ? 'mdi-head-lightbulb' : undefined"
        :prepend-icon="showLabels ? 'mdi-head-lightbulb' : undefined"
        variant="tonal"
        @click="chat.isThinkActive = !chat.isThinkActive"
      >
        <span v-if="showLabels">Think</span>
      </v-btn>
      <v-btn
        v-tooltip:top="!showLabels ? 'Search' : undefined"
        class="search-btn"
        :color="chat.isSearchActive ? 'blue' : 'white'"
        :disabled="!chat.models?.length"
        :icon="!showLabels ? 'mdi-magnify' : undefined"
        :prepend-icon="showLabels ? 'mdi-magnify' : undefined"
        variant="tonal"
        @click="chat.isSearchActive = !chat.isSearchActive"
      >
        <span v-if="showLabels">Search</span>
      </v-btn>
      <v-btn
        v-if="showSendButton"
        class="send-btn"
        :color="chat.isSending ? 'error' : undefined"
        :disabled="chat.isSending || chat.models?.length ? false : !canSend"
        :icon="chat.isSending ? 'mdi-stop' : 'mdi-send'"
        size="small"
        variant="text"
        @click="chat.isSending ? stopGeneration() : onFormSubmit($event)"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.chat-input-wrapper {
  padding: var(--padding-body);
  background-color: rgb(var(--v-theme-surface));
  border-top: 1px solid rgba(0, 0, 0, 0.12);
  padding-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-radius: 30px;
  position: relative;
}

.chat-input-container {
  position: relative;
  ::v-deep(.v-field) {
    --v-shadow-key-umbra-opacity: 0;
    border-radius: 20px;
  }
}

.chat-input {
  max-height: 200px;
  overflow: auto;
}

.prompt-autocomplete-wrapper {
  position: absolute;
  bottom: 150%;
  left: 50%;
  transform: translateX(-50%);
  max-width: 300px;
  width: 100%;
  z-index: 10;
}

.prompt-autocomplete-backdrop {
  position: absolute;
  top: -8px;
  left: -8px;
  right: -8px;
  bottom: -8px;
  background-color: rgb(var(--v-theme-surface));
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 30px;
  z-index: -1;
}

::v-deep(.v-input__control input) {
  cursor: text;
}

.prompt-input {
  ::v-deep(.v-field) {
    background-color: rgb(var(--v-theme-surface));
    border-radius: 20px;
    --v-shadow-key-umbra-opacity: 0;
  }
  ::v-deep(.v-field__input) {
    color: rgb(var(--v-theme-on-surface));
  }
  ::v-deep(.v-field-label) {
    color: rgb(var(--v-theme-on-surface));
    opacity: 0.6;
  }
}

.prompt-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 300px;
  overflow: auto;
}

.prompt-item {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
  overflow: hidden;
  text-overflow: ellipsis;
  text-wrap: nowrap;
  font-size: 1rem;
  color: rgb(var(--v-theme-on-surface));

  ::v-deep(.v-btn) {
    position: absolute;
    top: 20%;
    right: 2px;
  }
}

.chat-input-actions {
  display: flex;
  gap: 8px;

  .file-btn {
    max-width: 200px;
    overflow: hidden;

    ::v-deep(.v-btn__content) {
      display: block;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
  }

  .v-btn {
    --v-btn-height: 32px;

    text-transform: none;
    font-weight: normal;
    letter-spacing: normal;
    border-radius: 9999px;
    padding: 0 10px;
  }

  .v-btn--icon.v-btn--density-default {
    width: var(--v-btn-height);
    height: var(--v-btn-height);
    padding: 0 4px;
  }

  ::v-deep(.v-btn__prepend) {
    margin-inline: -4px 4px;
  }

  .file-btn.text-blue {
    padding-right: 40px;

    ::v-deep(.v-btn) {
      position: absolute;
      top: 0;
      right: 0;
    }
    ::v-deep(.v-btn .mdi-close) {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
    }
  }
}

::v-deep(.model-btn, .rag-btn) {
  max-width: 300px;
  width: auto;
  position: relative;
  display: flex;
  justify-content: start;
  overflow: hidden;
}

::v-deep(.autocomplete-rag__list),
::v-deep(.autocomplete-model__list) {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 15px;
  max-height: 300px;
  overflow: auto;
}

::v-deep(.autocomplete-rag__item),
::v-deep(.autocomplete-model__item) {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
  overflow: hidden;
  text-overflow: ellipsis;
  text-wrap: nowrap;
}
</style>
