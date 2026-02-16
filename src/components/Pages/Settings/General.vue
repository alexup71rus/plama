<script lang="ts" setup>
  import { computed, ref, watch } from 'vue';
  import { useSettingsStore } from '@/stores/settings';
  import { useChatStore } from '@/stores/chat';
  import { useAlert } from '@/plugins/alertPlugin';
  import { DEFAULT_SETTINGS, type ISettings, type SystemPrompt } from '@/types/settings.ts';

  const settingsStore = useSettingsStore();
  const chatStore = useChatStore();
  const { showSnackbar } = useAlert();

  const formSettings = ref<Partial<ISettings>>({
    theme: settingsStore.settings.theme,
    ollamaURL: settingsStore.settings.ollamaURL,
    systemModel: settingsStore.settings.systemModel || '',
    titlePrompt: settingsStore.settings.titlePrompt,
    defaultChatTitle: settingsStore.settings.defaultChatTitle,
    chatScrollMode: settingsStore.settings.chatScrollMode || 'scroll',
    systemPrompts: [...settingsStore.settings.systemPrompts],
    defaultSystemPrompt: settingsStore.settings.defaultSystemPrompt,
    maxMessages: settingsStore.settings.maxMessages,
    showToolbarLabels: settingsStore.settings.showToolbarLabels !== false,
    showSendButton: settingsStore.settings.showSendButton !== false,
  });

  const newPrompt = ref('');
  const newPromptTitle = ref('');
  const editingPromptIndex = ref<number | null>(null);

  const availableModels = computed(() => [
    { name: 'Use selected model', details: '', size: '', value: '' },
    ...(chatStore.models || []).map(model => ({ name: model.name, details: model.details, size: model.size, value: model.name })),
  ]);

  const connectionStatus = computed(() => chatStore.connectionStatus);

  const isFormValid = computed(() => {
    return (
      formSettings.value.ollamaURL?.trim() !== '' &&
      /^https?:\/\/[^\s/$.?#].[^\s]*$/.test(formSettings.value.ollamaURL || '') &&
      formSettings.value.defaultChatTitle?.trim() !== '' &&
      formSettings.value.maxMessages !== undefined
    );
  });

  const isPromptValid = computed(() => {
    return newPrompt.value.trim() !== '' && newPromptTitle.value.trim() !== '';
  });

  const isDefaultPrompt = computed(() => (prompt: SystemPrompt | null) => {
    if (!prompt && !formSettings.value.defaultSystemPrompt) return true;
    return prompt && formSettings.value.defaultSystemPrompt?.title === prompt.title;
  });

  const promptList = computed(() => [
    { title: 'No default', content: '' } as SystemPrompt,
    ...formSettings.value.systemPrompts || [],
  ]);

  const saveSettings = async () => {
    await settingsStore.updateSettings(formSettings.value);
    const isConnected = await chatStore.checkOllamaConnection();
    showSnackbar({
      message: isConnected
        ? 'Settings saved. Connection successful'
        : 'Settings saved but connection failed',
      type: isConnected ? 'success' : 'error',
    });
  };

  const resetSettings = () => {
    formSettings.value = {
      theme: DEFAULT_SETTINGS.theme,
      ollamaURL: DEFAULT_SETTINGS.ollamaURL,
      systemModel: DEFAULT_SETTINGS.systemModel,
      titlePrompt: DEFAULT_SETTINGS.titlePrompt,
      defaultChatTitle: DEFAULT_SETTINGS.defaultChatTitle,
      chatScrollMode: DEFAULT_SETTINGS.chatScrollMode || 'scroll',
      systemPrompts: [...DEFAULT_SETTINGS.systemPrompts],
      defaultSystemPrompt: DEFAULT_SETTINGS.defaultSystemPrompt,
      maxMessages: DEFAULT_SETTINGS.maxMessages,
      showToolbarLabels: DEFAULT_SETTINGS.showToolbarLabels,
      showSendButton: DEFAULT_SETTINGS.showSendButton,
    };
    settingsStore.resetSettings();
    showSnackbar({ message: 'General settings reset', type: 'success' });
  };

  const addOrUpdatePrompt = () => {
    if (!isPromptValid.value) {
      showSnackbar({ message: 'Prompt and title cannot be empty', type: 'error' });
      return;
    }
    const prompts = [...(formSettings.value.systemPrompts || [])];
    const prompt: SystemPrompt = { title: newPromptTitle.value, content: newPrompt.value };
    if (editingPromptIndex.value !== null) {
      prompts[editingPromptIndex.value - 1] = prompt;
      if (formSettings.value.defaultSystemPrompt?.title === prompts[editingPromptIndex.value - 1].title) {
        formSettings.value.defaultSystemPrompt = prompt;
      }
      showSnackbar({ message: 'Prompt updated', type: 'success' });
    } else {
      prompts.push(prompt);
      showSnackbar({ message: 'Prompt added', type: 'success' });
    }
    formSettings.value.systemPrompts = prompts;
    newPrompt.value = '';
    newPromptTitle.value = '';
    editingPromptIndex.value = null;
  };

  const editPrompt = (index: number) => {
    if (index === 0) {
      showSnackbar({ message: 'Cannot edit "No default" prompt', type: 'error' });
      return;
    }
    const prompt = promptList.value[index];
    newPrompt.value = prompt.content;
    newPromptTitle.value = prompt.title;
    editingPromptIndex.value = index;
  };

  const cancelEdit = () => {
    newPrompt.value = '';
    newPromptTitle.value = '';
    editingPromptIndex.value = null;
  };

  const deletePrompt = (index: number) => {
    if (index === 0) {
      showSnackbar({ message: 'Cannot delete "No default" prompt', type: 'error' });
      return;
    }
    const prompts = [...(formSettings.value.systemPrompts || [])];
    const deletedPrompt = prompts[index - 1];
    prompts.splice(index - 1, 1);
    if (formSettings.value.defaultSystemPrompt?.title === deletedPrompt?.title) {
      formSettings.value.defaultSystemPrompt = null;
    }
    formSettings.value.systemPrompts = prompts;
    showSnackbar({ message: 'Prompt deleted', type: 'success' });
  };

  const setDefaultPrompt = (prompt: SystemPrompt | null, index: number) => {
    formSettings.value.defaultSystemPrompt = index === 0 ? null : prompt;
    showSnackbar({ message: `Default system prompt set to "${prompt?.title || 'No default'}"`, type: 'success' });
  };

  const truncateContent = (content: string) => {
    if (!content) return '';
    const firstLine = content.split('\n')[0];
    return firstLine.length > 50 ? firstLine.slice(0, 50) + '...' : firstLine + (content.includes('\n') ? '...' : '');
  };

  watch(() => formSettings.value.ollamaURL, async newUrl => {
    if (newUrl && /^https?:\/\/[^\s/$.?#].[^\s]*$/.test(newUrl)) {
      await chatStore.checkOllamaConnection();
    }
  }, { immediate: true });
</script>

<template>
  <v-card-title class="text-h6 pb-2">
    General
  </v-card-title>
  <v-card-text>
    <v-form @submit.prevent="saveSettings">
      <v-select
        v-model="formSettings.theme"
        class="mb-4"
        :items="[{ title: 'Light', value: 'light' }, { title: 'Dark', value: 'dark' }, { title: 'System', value: 'system' }]"
        label="Theme"
        variant="solo-filled"
      />

      <v-select
        v-model="formSettings.chatScrollMode"
        class="mb-4"
        :items="[{ title: 'Gap', value: 'gap' }, { title: 'Scroll', value: 'scroll' }]"
        label="Chat Scroll Mode"
        variant="solo-filled"
      />

      <v-select
        v-model="formSettings.maxMessages"
        class="mb-4"
        :items="[5, 10, 20, 50, 100]"
        label="Max Messages for Neural Network"
        variant="solo-filled"
      />

      <v-divider class="mb-10" />

      <v-text-field
        v-model="formSettings.ollamaURL"
        class="mb-4"
        hint="For example: http://localhost:11434"
        label="Ollama URL"
        persistent-hint
        :rules="[v => !!v || 'URL is required', v => /^https?:\/\/[^\s/$.?#].[^\s]*$/.test(v) || 'Invalid URL format. Did you try http://localhost:11434?']"
        variant="solo-filled"
      >
        <template #append>
          <v-icon
            :color="connectionStatus === 'connected' ? 'success' : connectionStatus === 'checking' ? 'warning' : 'error'"
          >
            mdi-circle
          </v-icon>
        </template>
      </v-text-field>

      <v-select
        v-model="formSettings.systemModel"
        class="mb-4"
        :disabled="!availableModels.length"
        item-title="name"
        item-value="value"
        :items="availableModels"
        label="General model (for features)"
        :loading="connectionStatus === 'checking'"
        variant="solo-filled"
      />
      <v-textarea
        v-model="formSettings.titlePrompt"
        class="mb-4"
        label="Title prompt"
        rows="4"
        variant="solo-filled"
      />
      <v-text-field
        v-model="formSettings.defaultChatTitle"
        class="mb-4"
        label="Default chat title"
        :rules="[v => !!v || 'Title is required']"
        variant="solo-filled"
      />
    </v-form>

    <v-divider class="my-6" />
    <h3 class="section-subtitle">Toolbar</h3>
    <v-switch
      v-model="formSettings.showToolbarLabels"
      class="mb-2"
      color="primary"
      hide-details
      label="Show button labels"
    />
    <v-switch
      v-model="formSettings.showSendButton"
      class="mb-4"
      color="primary"
      hide-details
      label="Show send button"
    />

    <v-divider class="my-6" />
    <h3 class="section-subtitle">System Prompts</h3>
    <v-form class="prompt-form mb-4" @submit.prevent="addOrUpdatePrompt">
      <v-text-field
        v-model="newPromptTitle"
        class="mb-4"
        hide-details
        label="Prompt Title"
        variant="solo-filled"
      />
      <v-textarea
        v-model="newPrompt"
        class="mb-4"
        hide-details
        label="System Prompt"
        rows="4"
        variant="solo-filled"
      />
      <v-card-actions>
        <v-col>
          <v-btn
            block
            color="primary"
            :disabled="!isPromptValid"
            variant="flat"
            @click="addOrUpdatePrompt"
          >
            {{ editingPromptIndex !== null ? 'Update' : 'Add' }} Prompt
          </v-btn>
        </v-col>
        <v-col>
          <v-btn
            v-if="editingPromptIndex !== null"
            block
            variant="outlined"
            @click="cancelEdit"
          >Cancel</v-btn>
        </v-col>
      </v-card-actions>
    </v-form>

    <v-list class="prompt-list">
      <v-list-item
        v-for="(prompt, index) in promptList"
        :key="index"
        class="prompt-item"
      >
        <div class="prompt-content">
          <div class="content-title">{{ prompt.title }}</div>
          <div class="content-text">{{ truncateContent(prompt.content) }}</div>
        </div>
        <template #append>
          <v-btn
            v-if="!isDefaultPrompt(index === 0 ? null : prompt)"
            color="primary"
            icon="mdi-check-circle"
            variant="text"
            @click="setDefaultPrompt(index === 0 ? null : prompt, index)"
          />
          <v-btn
            color="primary"
            :disabled="index === 0"
            icon="mdi-pencil"
            variant="text"
            @click="editPrompt(index)"
          />
          <v-btn
            color="red"
            :disabled="index === 0"
            icon="mdi-delete"
            variant="text"
            @click="deletePrompt(index)"
          />
        </template>
      </v-list-item>
    </v-list>
    <div v-if="!formSettings.systemPrompts?.length" class="no-data">
      No system prompts available
    </div>
  </v-card-text>
  <v-card-actions>
    <v-col>
      <v-btn
        block
        color="blue"
        :disabled="!isFormValid"
        type="submit"
        variant="flat"
        @click="saveSettings"
      >Save Settings</v-btn>
    </v-col>
    <v-col>
      <v-btn
        block
        variant="outlined"
        @click="resetSettings"
      >Reset Settings</v-btn>
    </v-col>
  </v-card-actions>
</template>

<style lang="scss" scoped>
.v-card-text {
  padding: 16px;
}

.section-subtitle {
  font-size: 1.25rem;
  font-weight: 500;
  margin-bottom: 16px;
}

.prompt-form {
  margin-bottom: 24px;
}

.prompt-list {
  background: transparent;
}

.prompt-item {
  border-bottom: 1px solid rgb(var(--v-theme-on-primary));
  padding: 12px 0;
  display: flex;
  align-items: center;
}

.prompt-content {
  flex: 1;
  padding-right: 16px;
}

.content-title {
  font-size: 1.1rem;
  font-weight: 500;
  margin-bottom: 4px;
}

.content-text {
  font-size: 0.95rem;
  line-height: 1.5;
  color: #666;
}

.no-data {
  text-align: center;
  color: #666;
  padding: 16px;
}

::v-deep(.v-list-item) {
  padding-inline: 0 !important;
}

::v-deep(.v-list-item__append) {
  margin-left: auto;
}

.v-btn--icon {
  margin-left: 8px;
}
</style>
