import { describe, it, expect } from 'vitest';
import { SkillResolver } from '../../skills/skill-resolver';
import { Skill } from '../../skills/types';

function makeSkill(name: string, description: string, tags: string[]): Skill {
  return {
    name,
    description,
    format: 'kilo',
    tags,
    content: `Content for ${name}`,
    references: [],
    scripts: [],
    directory: `/tmp/skills/${name}`,
    source: { type: 'local', path: '/tmp' },
    state: 'installed',
    installedAt: new Date().toISOString(),
    metadata: {},
  };
}

describe('SkillResolver', () => {
  const resolver = new SkillResolver();

  const skills = [
    makeSkill('python-best-practices', 'Python coding standards and best practices', ['python', 'coding', 'standards']),
    makeSkill('orchard-core-theming', 'Evidence-first Orchard Core theming', ['orchard-core', 'theming', 'dotnet']),
    makeSkill('reverse-engineering', 'Reverse engineering techniques for binaries', ['reverse', 'engineering', 'binary']),
  ];

  describe('resolve', () => {
    it('returns empty result for no skills', () => {
      const result = resolver.resolve('hello world', []);
      expect(result.skills).toHaveLength(0);
      expect(result.method).toBe('none');
    });

    it('returns empty result for empty prompt', () => {
      const result = resolver.resolve('', skills);
      expect(result.skills).toHaveLength(0);
    });

    it('matches skill by name with high confidence', () => {
      const result = resolver.resolve('I need python help', skills);
      expect(result.skills.length).toBeGreaterThan(0);
      expect(result.skills[0].name).toBe('python-best-practices');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('matches skill by tag', () => {
      const result = resolver.resolve('how to theme orchard', skills);
      expect(result.skills.length).toBeGreaterThan(0);
      expect(result.skills[0].name).toBe('orchard-core-theming');
    });

    it('matches skill by description keywords', () => {
      const result = resolver.resolve('binary reverse engineering', skills);
      expect(result.skills.length).toBeGreaterThan(0);
      expect(result.skills[0].name).toBe('reverse-engineering');
      expect(result.method).toBe('keyword');
    });

    it('prioritizes name matches over description matches', () => {
      const result = resolver.resolve('python is the best coding language for standards', skills);
      const top = result.skills[0];
      expect(top.name).toBe('python-best-practices');
    });

    it('returns low confidence for unrelated prompts', () => {
      const result = resolver.resolve('what is the weather today', skills);
      expect(result.confidence).toBe(0);
      expect(result.skills).toHaveLength(0);
    });
  });
});
