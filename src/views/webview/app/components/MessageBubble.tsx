import React from 'react';
import { ChatMessage } from '../types';
import { postMessage } from '../vscode-api';
import { MarkdownRenderer } from './MarkdownRenderer';

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isError = message.role === 'system' && message.content.startsWith('\u274C');

  if (message.role === 'system' && !isError) {
    return <div className="message system">{message.content}</div>;
  }

  const className = isError ? 'error' : message.role;

  return (
    <div className={`message ${className}`}>
      {message.attachments && message.attachments.length > 0 && (
        <div className="attachment-preview" style={{ marginBottom: 8 }}>
          {message.attachments.map((att, i) => (
            <div key={i} className="attachment-item">
              {att.type === 'image' ? (
                <img className="attachment-img" src={`data:${att.mimeType};base64,${att.data}`} alt={att.name} />
              ) : (
                <div className="attachment-file">
                  <span className="attachment-name">{att.name}</span>
                  <span className="attachment-size">{att.size > 1024 ? `${(att.size / 1024).toFixed(1)} KB` : `${att.size} B`}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {message.role === 'assistant' && !isError ? (
        <MarkdownRenderer content={message.content} />
      ) : (
        <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>
      )}
      {(message.role === 'assistant' && !isError) || isError ? (
        <div className="message-actions">
          {!isError && (
            <button onClick={() => navigator.clipboard.writeText(message.content)} title="Copy">
              Copy
            </button>
          )}
          <button onClick={() => postMessage({ type: 'regenerate' })} title="Regenerate">
            {isError ? 'Retry' : 'Regenerate'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
