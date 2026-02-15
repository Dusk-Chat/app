import type { JSONContent } from "@tiptap/core";

// convert tiptap's json document tree to markdown-formatted text
// preserves formatting marks as markdown syntax for the wire format
export function tiptapToMarkdown(doc: JSONContent): string {
  if (!doc.content) return "";

  return doc.content
    .map((node) => {
      if (node.type === "paragraph") {
        if (!node.content) return "";
        return node.content.map(textNodeToMarkdown).join("");
      }
      // hard breaks become newlines
      if (node.type === "hardBreak") return "\n";
      return "";
    })
    .join("\n");
}

function textNodeToMarkdown(node: JSONContent): string {
  if (node.type === "hardBreak") return "\n";
  if (node.type !== "text" || !node.text) return "";

  let text = node.text;
  const marks = node.marks || [];

  const hasCode = marks.some((m) => m.type === "code");
  const hasBold = marks.some((m) => m.type === "bold");
  const hasItalic = marks.some((m) => m.type === "italic");
  const hasStrike = marks.some((m) => m.type === "strike");

  // code is exclusive - no other formatting applies inside it
  if (hasCode) {
    return `\`${text}\``;
  }

  if (hasBold && hasItalic) {
    text = `***${text}***`;
  } else if (hasBold) {
    text = `**${text}**`;
  } else if (hasItalic) {
    text = `*${text}*`;
  }

  if (hasStrike) {
    text = `~~${text}~~`;
  }

  return text;
}

// check if a string is a standalone image/gif url (no other text)
export function isStandaloneImageUrl(text: string): boolean {
  return /^https?:\/\/\S+\.(gif|png|jpg|jpeg|webp)(\?\S*)?$/i.test(text.trim());
}

// parse markdown-formatted text into safe html for display
// only produces a limited set of elements - no script injection possible
export function renderMarkdown(text: string): string {
  // standalone image url gets rendered as a full image
  if (isStandaloneImageUrl(text)) {
    const url = escapeHtml(text.trim());
    return `<img src="${url}" class="dusk-msg-image" alt="image" loading="lazy" />`;
  }

  // split by inline code spans to avoid parsing markdown inside code
  const segments = text.split(/(`[^`\n]+`)/g);
  let html = "";

  for (const segment of segments) {
    if (
      segment.startsWith("`") &&
      segment.endsWith("`") &&
      segment.length > 2
    ) {
      // inline code - escape and wrap, skip markdown processing
      const code = escapeHtml(segment.slice(1, -1));
      html += `<code class="dusk-msg-code">${code}</code>`;
    } else {
      let s = escapeHtml(segment);

      // bold + italic combined
      s = s.replace(
        /\*\*\*(.+?)\*\*\*/g,
        '<strong class="dusk-msg-bold"><em>$1</em></strong>',
      );
      // bold
      s = s.replace(
        /\*\*(.+?)\*\*/g,
        '<strong class="dusk-msg-bold">$1</strong>',
      );
      // italic
      s = s.replace(/\*(.+?)\*/g, '<em class="dusk-msg-italic">$1</em>');
      // strikethrough
      s = s.replace(/~~(.+?)~~/g, '<s class="dusk-msg-strike">$1</s>');

      // auto-link urls
      s = s.replace(
        /(https?:\/\/[^\s<]+)/g,
        '<a href="$1" target="_blank" rel="noopener noreferrer" class="dusk-msg-link">$1</a>',
      );

      html += s;
    }
  }

  // newlines to breaks
  html = html.replace(/\n/g, "<br />");

  return html;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
