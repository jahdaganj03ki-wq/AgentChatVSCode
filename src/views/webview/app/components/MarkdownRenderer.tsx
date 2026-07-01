import React, { useMemo, useState, useEffect } from 'react';
import { marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';

marked.use(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code: string, lang: string) {
      if (lang && hljs.getLanguage(lang)) {
        try {
          return hljs.highlight(code, { language: lang }).value;
        } catch {}
      }
      try {
        return hljs.highlightAuto(code).value;
      } catch {}
      return code;
    },
  })
);

marked.setOptions({
  breaks: true,
  gfm: true,
});

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const [html, setHtml] = useState<string>('');

  const syncHtml = useMemo(() => {
    try {
      const result = marked.parse(content);
      if (typeof result === 'string') return result;
      return null;
    } catch {
      return null;
    }
  }, [content]);

  useEffect(() => {
    if (syncHtml !== null) {
      setHtml(syncHtml);
      return;
    }
    try {
      const result = marked.parse(content);
      if (result instanceof Promise) {
        result.then(setHtml).catch(() => {
          setHtml(`<p>${escapeHtml(content)}</p>`);
        });
      }
    } catch {
      setHtml(`<p>${escapeHtml(content)}</p>`);
    }
  }, [content, syncHtml]);

  if (!html) {
    return <div className="markdown-content"><p>{content}</p></div>;
  }

  return (
    <div
      className="markdown-content"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
