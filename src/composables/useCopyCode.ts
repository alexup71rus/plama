import type { Ref } from 'vue';
import { onMounted } from 'vue';

export function useCopyCode (
  bubbleRef: Ref<HTMLElement | undefined>,
  showSnackbar: (args: { message: string; type?: 'success' | 'error' | 'info' | 'warning' }) => void
) {
  onMounted(() => {
    bubbleRef.value?.addEventListener('click', async (ev: MouseEvent) => {
      const target = ev.target as HTMLElement;

      if (target.classList.contains('copy-button')) {
        const block = target.parentElement;
        const codeElement = block?.querySelector('code');

        if (codeElement) {
          const code = codeElement.innerText.replace(/^\d+\s+/gm, '');

          await navigator.clipboard.writeText(code);

          showSnackbar({ message: 'Copied!', type: 'success' });
        }
      }
    });
  });
}
