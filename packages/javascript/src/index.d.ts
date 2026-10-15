export interface Skill {
  name: string;
  description: string;
  path: string;
  absolutePath: string;
  body: string;
  content: string;
  frontmatter: Record<string, string>;
  frontmatterText: string;
  digest: string;
  valid: boolean;
  diagnostics: string[];
}

export interface OptimizeOptions {
  root: string;
  query: string;
  maxSkills?: number;
}

export class SkillParseError extends Error {
  skillPath: string;
}

export function parseSkill(content: string, skillPath?: string): Omit<Skill, "absolutePath">;
export function scanSkills(root: string): Promise<Skill[]>;
export function estimateTokens(text: string): number;
export function skillCard(skill: Skill): Record<string, unknown>;
export function renderCatalog(skills: Skill[]): {
  text: string;
  estimatedTokens: number;
  skills: Array<Record<string, unknown>>;
};
export function rankSkills(skills: Skill[], query: string): Array<{ skill: Skill; score: number }>;
export function optimizeSkill(skill: Skill, query: string): Promise<Record<string, unknown>>;
export function optimize(options: OptimizeOptions): Promise<Record<string, unknown>>;

