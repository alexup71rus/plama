<script lang="ts" setup>
  import { computed, nextTick, ref, watch } from 'vue';
  import { parseMarkdown } from '@/utils/markdown';
  import { formatThinkTime } from '@/utils/chatUtils';

  const props = defineProps<{
    message: { thinkTime?: number; isThinking?: boolean; content: string };
  }>();

  const expandedPanel = ref<number[] | number | null>(null);
  const thinkPreviewRef = ref<HTMLElement>();
  const parsedThinkContent = computed(() => parseMarkdown(props.message.content, true));

  const title = computed(() => {
    const hasTime = props.message.thinkTime !== undefined && props.message.thinkTime !== null;
    const timeText = hasTime ? ` (${formatThinkTime(props.message.thinkTime ?? 0)})` : '';

    if (props.message.isThinking) {
      return `Thinking...${timeText}`;
    }

    if (hasTime) {
      return `Thought for: ${formatThinkTime(props.message.thinkTime ?? 0)}`;
    }

    return 'Thoughts';
  });

  watch(() => props.message.content, async () => {
    await nextTick();
    thinkPreviewRef.value?.scrollTo({
      top: thinkPreviewRef.value.scrollHeight - 55,
      behavior: 'smooth',
    });
  });
</script>

<template>
  <div class="think-preview">
    <v-expansion-panels v-model="expandedPanel">
      <v-expansion-panel
        :title="title"
      >
        <v-expansion-panel-text>
          <v-card variant="tonal" v-html="parsedThinkContent" />
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
    <v-expand-transition>
      <v-card
        v-if="message.isThinking && (expandedPanel === null || expandedPanel === undefined)"
        class="preview"
        variant="elevated"
      >
        <template #text>
          <div ref="thinkPreviewRef" class="preview__content" v-html="parsedThinkContent" />
        </template>
      </v-card>
    </v-expand-transition>
  </div>
</template>

<style lang="scss" scoped>
.think-preview > .v-card {
  &::before,
  &::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    height: 3rem;
    pointer-events: none;
    z-index: 1;
  }

  &::before {
    top: 5px;
    background: linear-gradient(to bottom, rgb(var(--v-theme-surface)), transparent);
  }

  &::after {
    bottom: 0;
    background: linear-gradient(to top, rgb(var(--v-theme-surface)), transparent);
  }
}

.think-preview .preview {
  transform: translateY(-5px);
  position: relative;
  color: rgb(var(--v-theme-on-background));
  transition: 0.2s;

  &__content {
    height: 3rem;
    overflow: hidden;
    position: relative;
  }
}
</style>
