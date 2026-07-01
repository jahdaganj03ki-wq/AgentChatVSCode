import * as vscode from 'vscode';
import { SkillInfo } from './types';
import { Logger } from '../utils/logger';

interface RegistrySource {
  searchGithub(query: string): Promise<SkillInfo[]>;
  searchUrls(query: string): Promise<SkillInfo[]>;
  searchCommunity(query: string): Promise<SkillInfo[]>;
}

const CACHE_TTL = 5 * 60 * 1000;

interface CacheEntry {
  data: SkillInfo[];
  timestamp: number;
  query: string;
  source: string;
}

export class SkillRegistry implements RegistrySource {
  private cache: Map<string, CacheEntry> = new Map();

  async searchAll(query: string): Promise<SkillInfo[]> {
    const results: SkillInfo[] = [];
    const [github, urls, community] = await Promise.all([
      this.searchGithub(query),
      this.searchUrls(query),
      this.searchCommunity(query),
    ]);
    results.push(...github, ...urls, ...community);

    const seen = new Set<string>();
    return results.filter((s) => {
      if (seen.has(s.name)) return false;
      seen.add(s.name);
      return true;
    });
  }

  async searchGithub(query: string): Promise<SkillInfo[]> {
    const cacheKey = `github:${query}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    try {
      const config = vscode.workspace.getConfiguration('apexagent');
      const token = config.get<string>('githubToken', '');
      const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3+json',
      };
      if (token) {
        headers['Authorization'] = `token ${token}`;
      }

      const encodedQuery = encodeURIComponent(`skills/SKILL.md+in:path+${query}`);
      const response = await fetch(
        `https://api.github.com/search/repositories?q=${encodedQuery}&per_page=20`,
        { headers }
      );

      if (!response.ok) {
        Logger.warn('SkillRegistry', `GitHub API error: ${response.status}`);
        return [];
      }

      const data: any = await response.json();
      const items = data.items || [];

      const skills: SkillInfo[] = [];
      for (const item of items) {
        const skill = await this.extractGithubSkillInfo(item);
        if (skill) skills.push(skill);
      }

      this.setCached(cacheKey, skills);
      return skills;
    } catch (err: any) {
      Logger.warn('SkillRegistry', `GitHub search failed: ${err.message}`);
      return [];
    }
  }

  private async extractGithubSkillInfo(item: any): Promise<SkillInfo | null> {
    const name = item.name || '';
    const description = item.description || '';
    const fullName = item.full_name || '';

    try {
      const rawUrl = `https://raw.githubusercontent.com/${fullName}/main/SKILL.md`;
      const response = await fetch(rawUrl);
      if (response.ok) {
        const content = await response.text();
        const match = content.match(/^---\n([\s\S]*?)\n---/);
        if (match) {
          const fm = this.parseSimpleYaml(match[1]);
          return {
            name: fm.name || name,
            description: fm.description || description,
            tags: fm.tags || [],
            state: 'discovered',
            source: fullName,
            format: 'kilo',
          };
        }
      }
    } catch { }

    // Fallback: try skills/<name>/ path
    try {
      const branches = ['main', 'master'];
      for (const branch of branches) {
        const rawUrl = `https://raw.githubusercontent.com/${fullName}/${branch}/skills/SKILL.md`;
        const response = await fetch(rawUrl);
        if (response.ok) {
          const content = await response.text();
          const match = content.match(/^---\n([\s\S]*?)\n---/);
          if (match) {
            const fm = this.parseSimpleYaml(match[1]);
            return {
              name: fm.name || name,
              description: fm.description || description,
              tags: fm.tags || [],
              state: 'discovered',
              source: fullName,
              format: 'kilo',
            };
          }
        }
      }
    } catch { }

    return {
      name,
      description: description || 'No description',
      tags: [],
      state: 'discovered',
      source: fullName,
    };
  }

  async searchUrls(query: string): Promise<SkillInfo[]> {
    const config = vscode.workspace.getConfiguration('apexagent');
    const urls = config.get<string[]>('skills.urls', []);
    if (urls.length === 0) return [];

    const cacheKey = `urls:${query}`;
    const cached = this.getCached(cacheKey);
    if (cached) return this.filterByQuery(cached, query);

    try {
      const results: SkillInfo[] = [];
      for (const url of urls) {
        try {
          const response = await fetch(url);
          if (!response.ok) continue;
          const data: any = await response.json();
          if (Array.isArray(data)) {
            results.push(...data.map((s: any) => ({
              name: s.name || '',
              description: s.description || '',
              tags: s.tags || [],
              state: 'discovered' as const,
              source: s.source || url,
            })));
          }
        } catch {
          Logger.warn('SkillRegistry', `Failed to fetch registry URL: ${url}`);
        }
      }

      this.setCached(cacheKey, results);
      return this.filterByQuery(results, query);
    } catch (err: any) {
      Logger.warn('SkillRegistry', `URL search failed: ${err.message}`);
      return [];
    }
  }

  async searchCommunity(query: string): Promise<SkillInfo[]> {
    const cacheKey = `community:${query}`;
    const cached = this.getCached(cacheKey);
    if (cached) return this.filterByQuery(cached, query);

    // Community registry endpoint placeholder
    // const url = `https://registry.apexagent.dev/v1/skills?q=${encodeURIComponent(query)}`;
    return [];
  }

  private filterByQuery(skills: SkillInfo[], query: string): SkillInfo[] {
    if (!query) return skills;
    const q = query.toLowerCase();
    return skills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q))
    );
  }

  private getCached(key: string): SkillInfo[] | null {
    const entry = this.cache.get(key);
    if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
      return entry.data;
    }
    return null;
  }

  private setCached(key: string, data: SkillInfo[]) {
    this.cache.set(key, { data, timestamp: Date.now(), query: key, source: key.split(':')[0] });
  }

  clearCache() {
    this.cache.clear();
  }

  private parseSimpleYaml(str: string): Record<string, any> {
    const result: Record<string, any> = {};
    for (const line of str.split('\n')) {
      const pair = line.match(/^(\w+):\s+(.+)$/);
      if (pair) {
        let val: any = pair[2].replace(/^"|"$/g, '');
        if (val.startsWith('[') && val.endsWith(']')) {
          val = val.slice(1, -1).split(',').map((s: string) => s.trim().replace(/^"|"$/g, ''));
        }
        result[pair[1]] = val;
      }
    }
    return result;
  }
}
