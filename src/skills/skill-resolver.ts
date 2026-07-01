import { Skill, SkillInfo, SkillState } from './types';
import { Logger } from '../utils/logger';

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
  'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'out', 'off', 'over', 'under', 'again', 'further',
  'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how',
  'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
  'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so',
  'than', 'too', 'very', 'just', 'because', 'but', 'and', 'or', 'if',
  'while', 'about', 'up', 'it', 'its', 'this', 'that', 'these', 'those',
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'him', 'his',
  'she', 'her', 'they', 'them', 'their', 'what', 'which', 'who',
  'whom', 'whose',
]);

export interface ResolverResult {
  skills: Skill[];
  confidence: number;
  method: 'keyword' | 'llm' | 'none';
}

export class SkillResolver {
  resolve(prompt: string, availableSkills: Skill[]): ResolverResult {
    if (availableSkills.length === 0) {
      return { skills: [], confidence: 0, method: 'none' };
    }

    const keywords = this.extractKeywords(prompt);
    if (keywords.length === 0) {
      return { skills: [], confidence: 0, method: 'none' };
    }

    const scored = availableSkills.map((skill) => {
      const nameTokens = this.tokenize(skill.name);
      const tagTokens = skill.tags.flatMap((t) => this.tokenize(t));
      const descTokens = this.tokenize(skill.description);

      let matchCount = 0;
      const totalWeight = keywords.length * 3; // 3x weight for name matching by default

      for (const kw of keywords) {
        const nameScore = nameTokens.filter((t) => t.includes(kw) || kw.includes(t)).length * 3;
        const tagScore = tagTokens.filter((t) => t.includes(kw) || kw.includes(t)).length * 2;
        const descScore = descTokens.filter((t) => t.includes(kw) || kw.includes(t)).length * 1;
        matchCount += nameScore + tagScore + descScore;
      }

      const confidence = totalWeight > 0 ? Math.min(matchCount / totalWeight, 1) : 0;

      return { skill, confidence };
    });

    scored.sort((a, b) => b.confidence - a.confidence);

    const highConfidence = scored.filter((s) => s.confidence >= 0.8);
    const midConfidence = scored.filter((s) => s.confidence >= 0.3 && s.confidence < 0.8);

    if (highConfidence.length > 0) {
      return {
        skills: highConfidence.map((s) => s.skill),
        confidence: highConfidence[0].confidence,
        method: 'keyword',
      };
    }

    if (midConfidence.length > 0) {
      return {
        skills: midConfidence.map((s) => s.skill),
        confidence: midConfidence[0].confidence,
        method: 'keyword', // LLM fallback is deferred for future implementation
      };
    }

    return { skills: [], confidence: 0, method: 'none' };
  }

  private extractKeywords(text: string): string[] {
    const tokens = this.tokenize(text);
    return tokens.filter((t) => !STOP_WORDS.has(t) && t.length > 1);
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .split(/\s+/)
      .filter(Boolean);
  }
}
