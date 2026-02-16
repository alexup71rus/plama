import hljs from 'highlight.js';
import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';

const markedInstance = new Marked(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : 'plaintext';
      const highlighted = hljs.highlight(code, { language }).value;

      return `
        <div class="code-block-wrapper">
          <button class="copy-button">Copy</button>
          <pre><code class="hljs language-${language}">${highlighted
            .split("\n")
            .map((line, i) =>
              `<div class="code-line"><span class="line-number">${i + 1}</span><span class="line-content">${line}</span></div>`
            )
            .join("\n")}</code></pre>
        </div>
      `;
    },
  }),
  {
    renderer: {
      link(token): string | false {
        const { href, title, text } = token;
        const titleAttr = title ? ` title="${title}"` : '';
        return `<a href="${href}" target="_blank" rel="noopener"${titleAttr}>${text}</a>`;
      },
    },
  }
);

export function wrapThinkBlocks(html: string): string {
  const tags: Array<'think' | 'analysis'> = ['think', 'analysis'];

  for (const tag of tags) {
    const openTag = new RegExp(`<${tag}[^>]*>`, 'i');
    const closeTag = new RegExp(`</${tag}>`, 'i');
    const block = new RegExp(`<${tag}[^>]*>[\s\S]*?</${tag}>`, 'i');

    if (block.test(html)) {
      const match = html.match(block);
      return match ? match[0] : '';
    }

    // Streaming: opening tag may be present without the closing tag yet.
    if (openTag.test(html) && !closeTag.test(html)) {
      const index = html.search(openTag);
      return index >= 0 ? html.slice(index) : '';
    }
  }

  return '';
}

function removeThinkBlocks(html: string): string {
  let result = html;

  // Remove completed blocks.
  result = result.replace(/<think[^>]*>[\s\S]*?<\/think>/gi, '');
  result = result.replace(/<analysis[^>]*>[\s\S]*?<\/analysis>/gi, '');

  // Remove incomplete streaming blocks (opening tag without close yet).
  result = result.replace(/<think[^>]*>[\s\S]*/gi, '');
  result = result.replace(/<analysis[^>]*>[\s\S]*/gi, '');

  return result;
}

export function parseMarkdown(markdown: string, isThink = false) {
  const rawHtml = markedInstance.parse(markdown) as string;
  return isThink ? wrapThinkBlocks(rawHtml) : removeThinkBlocks(rawHtml);
}
