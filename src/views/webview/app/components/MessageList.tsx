import React, { useEffect, useRef } from 'react';
import { MessageBubble } from './MessageBubble';
import { ChatMessage } from '../types';

interface MessageListProps {
  messages: ChatMessage[];
  streamingContent: string;
  isStreaming: boolean;
}

export function MessageList({ messages, streamingContent, isStreaming }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  if (messages.length === 0 && !isStreaming) {
    return (
      <div className="chat-area" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--vscode-descriptionForeground)' }}>
          <p style={{ fontSize: '1.2em', marginBottom: 8 }}>ApexAgent</p>
          <p>Send a message to start chatting.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-area">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      {isStreaming && streamingContent && (
        <div className="message assistant streaming-cursor">{streamingContent}</div>
      )}
      {isStreaming && !streamingContent && (
        <div className="message assistant loading-dots">Thinking</div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
