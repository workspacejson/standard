import type { Rule, RuleFactory } from './types.js';

export interface Preset {
  name: string;
  description: string;
  rules: Array<{
    id: string;
    factory?: RuleFactory;
    config?: Record<string, unknown>;
  }>;
}

export interface RulePack {
  name: string;
  version: string;
  rules: Rule[];
  presets?: Preset[];
}
