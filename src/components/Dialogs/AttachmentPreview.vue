<script lang="ts" setup>
  import { type AttachmentMeta, AttachmentType } from '@/types/chats';

  defineProps<{
    meta: AttachmentMeta;
    content: string;
  }>();

  defineEmits<{
    (e: 'update:modelValue', value: boolean): void;
  }>();
</script>

<template>
  <v-dialog
    class="attachment-preview"
    max-width="800px"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="attachment-preview__wrapper">
      <span class="modal-close">
        <v-icon>mdi-close</v-icon>
      </span>
      <div v-if="meta.type === AttachmentType.IMAGE" class="image-preview">
        <img alt="Attachment" :src="`data:image/${meta.type.split('/')[1] || 'jpeg'};base64,${content}`">
      </div>
      <pre
        v-else
        class="attachment-preview__preview"
      >{{ content }}</pre>
      <span class="attachment-preview__title">
        {{ meta.name }}
      </span>
    </div>
  </v-dialog>
</template>

<style lang="scss" scoped>
.attachment-preview {
  &__wrapper {
    background: rgb(var(--v-theme-surface));
    border-radius: 8px;
    padding: 16px;
  }

  &__title {
    display: inline-block;
    margin: 16px auto 0;
    padding: 4px 8px;
    text-align: center;
    background: rgb(var(--v-theme-background));
    border-radius: 50px;
  }
}

.image-preview {
  display: flex;
  justify-content: center;

  img {
    max-width: 100%;
    max-height: 80%;
    object-fit: contain;
  }
}

.attachment-preview__preview {
  background-color: rgb(var(--v-theme-background));
  padding: 15px;
  border-radius: 5px;
  min-height: 200px;
  max-height: 600px;
  overflow: auto;
}
</style>
