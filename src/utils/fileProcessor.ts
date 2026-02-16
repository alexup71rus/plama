import { type AttachmentMeta, AttachmentType } from '@/types/chats';
import { useAlert } from '@/plugins/alertPlugin.ts';

export interface AttachmentContent {
  content: string;
  type: AttachmentType;
  meta: AttachmentMeta;
}

export async function processFile (file: File, visionEnabled: boolean = true): Promise<AttachmentContent | null> {
  const { showSnackbar } = useAlert();

  const isImage = file.type.startsWith('image/') && /\.(png|jpe?g)$/i.test(file.name);
  const isText = file.type.startsWith('text/') || /\.(txt|md|json|xml|csv)$/i.test(file.name);

  if (isImage && !visionEnabled) {
    showSnackbar({
      message: 'Current model does not support images. Select a vision model (e.g. llava, llama3.2-vision).',
      type: 'error',
    });
    return null;
  }

  if (!isImage && !isText) {
    showSnackbar({
      message: 'Unsupported file type. Only images and text files are allowed.',
      type: 'error',
    });
    return null;
  }

  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;

      if (isImage) {
        const img = new Image();
        img.src = result;
        img.onload = () => {
          let width = img.width;
          let height = img.height;
          const maxWidth = 1024;
          const maxHeight = 768;

          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0, width, height);
          const base64 = canvas.toDataURL('image/jpeg', 0.8);
          const compressedBase64 = base64.split(',')[1];

          resolve({
            content: compressedBase64,
            type: AttachmentType.IMAGE,
            meta: {
              name: file.name,
              size: file.size,
              type: AttachmentType.IMAGE,
              lastModified: file.lastModified,
            },
          });
        };
      } else {
        resolve({
          content: result,
          type: AttachmentType.TEXT,
          meta: {
            name: file.name,
            size: file.size,
            type: AttachmentType.TEXT,
            lastModified: file.lastModified,
          },
        });
      }
    };

    reader.onerror = () => {
      showSnackbar({
        message: 'Error reading file. Please try again.',
        type: 'error',
      });
      resolve(null);
    };

    if (isImage) reader.readAsDataURL(file);
    else reader.readAsText(file);
  });
}
