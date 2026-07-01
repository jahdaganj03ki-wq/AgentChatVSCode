import React, { useState, useRef, useEffect } from 'react';
import { SkillInfo } from '../types';
import { useChat } from '../context/ChatContext';
import { SkillInstallDialog } from './SkillInstallDialog';

export function SkillSelector() {
  const { state, activateSkill, deactivateSkill, searchSkills } = useChat();
  const [open, setOpen] = useState(false);
  const [showInstall, setShowInstall] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeCount = state.skills.filter((s) => s.state === 'active').length;
  const maxActive = 5;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleToggle = (skill: SkillInfo) => {
    if (skill.state === 'active') {
      deactivateSkill([skill.name]);
    } else if (skill.state === 'installed' || skill.state === 'discovered') {
      activateSkill([skill.name]);
    }
  };

  const stateIcon = (s: SkillInfo) => {
    switch (s.state) {
      case 'active': return '\uD83D\uDFE2';
      case 'error': return '\uD83D\uDD34';
      default: return '\u26AA';
    }
  };

  return (
    <>
      <div ref={dropdownRef} style={{ position: 'relative' }}>
        <button
          className="header-btn"
          onClick={() => setOpen(!open)}
          title={`Skills (${activeCount}/${maxActive} active)`}
        >
          {'\uD83E\uDDE0'} Skills ({activeCount}/{maxActive})
        </button>

        {open && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              zIndex: 1000,
              background: 'var(--vscode-dropdown-background)',
              border: '1px solid var(--vscode-dropdown-border)',
              borderRadius: '4px',
              minWidth: '320px',
              maxHeight: '400px',
              overflowY: 'auto',
              boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ padding: '8px 12px', fontWeight: 600, fontSize: '12px', borderBottom: '1px solid var(--vscode-dropdown-border)' }}>
              {'\uD83E\uDDE0'} Active Skills ({activeCount}/{maxActive} max)
            </div>

            {state.skills.length === 0 && (
              <div style={{ padding: '12px', color: 'var(--vscode-descriptionForeground)', fontSize: '12px' }}>
                No skills found. Install skills from the community or create your own.
              </div>
            )}

            {state.skills.map((skill) => (
              <label
                key={skill.name}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                  padding: '8px 12px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  borderBottom: '1px solid var(--vscode-dropdown-border)',
                  background: skill.state === 'active' ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent',
                }}
              >
                <input
                  type="checkbox"
                  checked={skill.state === 'active'}
                  disabled={skill.state === 'error'}
                  onChange={() => handleToggle(skill)}
                  style={{ marginTop: '2px' }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>{skill.name}</div>
                  <div style={{ color: 'var(--vscode-descriptionForeground)', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {skill.description}
                  </div>
                </div>
                <span title={skill.state}>{stateIcon(skill)}</span>
              </label>
            ))}

            <div style={{ padding: '8px', borderTop: '1px solid var(--vscode-dropdown-border)' }}>
              <button
                className="header-btn"
                style={{ width: '100%', textAlign: 'left', padding: '6px 8px' }}
                onClick={() => { setOpen(false); setShowInstall(true); }}
              >
                + Install Skill...
              </button>
              <button
                className="header-btn"
                style={{ width: '100%', textAlign: 'left', padding: '6px 8px', marginTop: '4px' }}
                onClick={() => { searchSkills(''); }}
              >
                {'\uD83D\uDD0D'} Search Registry...
              </button>
            </div>
          </div>
        )}
      </div>

      {showInstall && <SkillInstallDialog onClose={() => setShowInstall(false)} />}
    </>
  );
}
