import React from 'react';
import { Session } from '../types';

interface SidebarProps {
  sessions: Session[];
  onSelectSession: (id: string) => void;
  onClose: () => void;
}

function groupSessions(sessions: Session[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const groups: { label: string; sessions: Session[] }[] = [
    { label: 'Today', sessions: [] },
    { label: 'Yesterday', sessions: [] },
    { label: 'Older', sessions: [] },
  ];

  for (const session of sessions) {
    const updated = new Date(session.updatedAt);
    if (updated >= today) {
      groups[0].sessions.push(session);
    } else if (updated >= yesterday) {
      groups[1].sessions.push(session);
    } else {
      groups[2].sessions.push(session);
    }
  }

  return groups.filter((g) => g.sessions.length > 0);
}

export function Sidebar({ sessions, onSelectSession, onClose }: SidebarProps) {
  const groups = groupSessions(sessions);

  return (
    <>
      <div className="sidebar-overlay" onClick={onClose} />
      <div className="sidebar">
        <div className="sidebar-header">
          <span>Sessions</span>
          <button className="sidebar-close" onClick={onClose}>&times;</button>
        </div>
        {groups.length === 0 ? (
          <div className="no-sessions">No sessions yet</div>
        ) : (
          groups.map((group) => (
            <div key={group.label} className="session-group">
              <div className="session-group-title">{group.label}</div>
              {group.sessions.map((session) => (
                <div
                  key={session.id}
                  className="session-item"
                  onClick={() => onSelectSession(session.id)}
                >
                  <span className="session-item-title">{session.title}</span>
                  <span className="session-item-meta">
                    {session.messages.length} messages
                  </span>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </>
  );
}
