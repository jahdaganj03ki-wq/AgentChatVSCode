import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useChat } from '../context/ChatContext';
import { Attachment, ExtensionMessage } from '../types';
import { postMessage } from '../vscode-api';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function InputArea() {
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { state, sendMessage } = useChat();

  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
    }
  }, [input]);

  useEffect(() => {
    const handler = (event: MessageEvent<ExtensionMessage>) => {
      const message = event.data;
      if (message.type === 'attachments-picked' && message.attachments) {
        setAttachments((prev) => [...prev, ...message.attachments!]);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = () => {
    const text = input.trim();
    if ((!text && attachments.length === 0) || state.isStreaming) return;
    sendMessage(text, attachments.length > 0 ? attachments : undefined);
    setInput('');
    setAttachments([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    const newAttachments: Attachment[] = [];
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) continue;
      const data = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(data)));
      const mime = file.type || 'application/octet-stream';
      newAttachments.push({
        type: mime.startsWith('image/') ? 'image' : 'file',
        name: file.name,
        mimeType: mime,
        data: base64,
        size: file.size,
      });
    }
    if (newAttachments.length > 0) {
      setAttachments((prev) => [...prev, ...newAttachments]);
    }
  };

  return (
    <div
      className={`input-area${isDragOver ? ' drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {attachments.length > 0 && (
        <div className="attachment-preview">
          {attachments.map((att, index) => (
            <div key={index} className="attachment-item">
              {att.type === 'image' ? (
                <img
                  className="attachment-img"
                  src={`data:${att.mimeType};base64,${att.data}`}
                  alt={att.name}
                />
              ) : (
                <div className="attachment-file">
                  <span className="attachment-name">{att.name}</span>
                  <span className="attachment-size">{formatSize(att.size)}</span>
                </div>
              )}
              <button className="attachment-remove" onClick={() => removeAttachment(index)} title="Remove">&times;</button>
            </div>
          ))}
        </div>
      )}
      <button className="attach-btn" onClick={() => postMessage({ type: 'pick-attachment' })} title="Attach file">&#128206;</button>
      <textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={attachments.length > 0 ? 'Add a message or send with attachments...' : 'Type a message... (Enter to send, Shift+Enter for new line)'}
        rows={1}
        disabled={state.isStreaming}
      />
      <button
        className="send-btn"
        onClick={state.isStreaming ? undefined : handleSubmit}
        disabled={(!input.trim() && attachments.length === 0) || state.isStreaming}
      >
        {state.isStreaming ? '\u25A0' : '\u25B6'}
      </button>
    </div>
  );
}
