import { describe, it, expect } from 'vitest';
import { parseSkillMd, parseFrontmatter } from '../../skills/format-parsers/skill-md-parser';
import { parseClaudeSkill } from '../../skills/format-parsers/claude-parser';
import { parseCodexSkill } from '../../skills/format-parsers/codex-parser';
import { parseZCodeSkill } from '../../skills/format-parsers/zcode-parser';

const validFrontmatter = `---
name: orchard-core-theming
description: Evidence-first Orchard Core theming skill
license: MIT
metadata:
  author: Lombiq Technologies
  version: "1.0"
tags: [orchard-core, theming, dotnet]
---

This skill helps you theme Orchard Core sites using an evidence-first approach.`;

const minimalFrontmatter = `---
name: minimal-skill
description: A minimal skill
---

Just some content.`;

describe('format-parsers', () => {
  describe('parseFrontmatter', () => {
    it('parses valid frontmatter with tags and metadata', () => {
      const result = parseFrontmatter(validFrontmatter);
      expect(result).not.toBeNull();
      expect(result!.name).toBe('orchard-core-theming');
      expect(result!.description).toBe('Evidence-first Orchard Core theming skill');
      expect(result!.tags).toEqual(['orchard-core', 'theming', 'dotnet']);
      expect(result!.metadata.author).toBe('Lombiq Technologies');
      expect(result!.metadata.version).toBe('1.0');
      expect(result!.metadata.license).toBe('MIT');
    });

    it('parses minimal frontmatter without tags', () => {
      const result = parseFrontmatter(minimalFrontmatter);
      expect(result).not.toBeNull();
      expect(result!.name).toBe('minimal-skill');
      expect(result!.tags).toEqual([]);
    });

    it('returns null for content without frontmatter', () => {
      expect(parseFrontmatter('Just plain text')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(parseFrontmatter('')).toBeNull();
    });
  });

  describe('parseSkillMd', () => {
    it('creates a complete Skill object from valid input', () => {
      const skill = parseSkillMd(validFrontmatter, '/tmp/skills/test', 'kilo', { type: 'local', path: '/tmp' });
      expect(skill).not.toBeNull();
      expect(skill!.name).toBe('orchard-core-theming');
      expect(skill!.format).toBe('kilo');
      expect(skill!.state).toBe('discovered');
      expect(skill!.tags).toHaveLength(3);
      expect(skill!.references).toEqual([]);
      expect(skill!.scripts).toEqual([]);
    });

    it('returns null for missing name', () => {
      const bad = `---
description: no name
---
content`;
      expect(parseSkillMd(bad, '/tmp', 'kilo', { type: 'local', path: '' })).toBeNull();
    });

    it('returns null for missing description', () => {
      const bad = `---
name: no-desc
---
content`;
      expect(parseSkillMd(bad, '/tmp', 'kilo', { type: 'local', path: '' })).toBeNull();
    });
  });

  describe('parseClaudeSkill', () => {
    it('parses valid content as claude format', () => {
      const skill = parseClaudeSkill(validFrontmatter, '/tmp/claude', { type: 'local', path: '' });
      expect(skill).not.toBeNull();
      expect(skill!.format).toBe('claude');
    });
  });

  describe('parseCodexSkill', () => {
    it('parses valid content as codex format', () => {
      const skill = parseCodexSkill(validFrontmatter, '/tmp/codex', { type: 'local', path: '' });
      expect(skill).not.toBeNull();
      expect(skill!.format).toBe('codex');
    });
  });

  describe('parseZCodeSkill', () => {
    it('parses valid content as zcode format', () => {
      const skill = parseZCodeSkill(validFrontmatter, '/tmp/zcode', { type: 'local', path: '' });
      expect(skill).not.toBeNull();
      expect(skill!.format).toBe('zcode');
    });
  });
});
