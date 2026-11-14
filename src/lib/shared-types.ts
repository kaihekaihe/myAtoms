import type { AppBlueprint, RecordData } from './blueprint';

export type { RecordData };

export interface ProjectSummary {
  id: number;
  name: string;
  description: string;
  active_version: number | null;
  record_count: number;
}

export interface VersionInfo {
  id: number;
  version: number;
  engine: string;
  source_prompt: string;
  created_at: string;
}

export interface RunStepView {
  seq: number;
  agent: string;
  title: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  ms?: number;
  note?: string;
}

export interface RunView {
  run: {
    id: number;
    prompt: string;
    status: string;
    error: string;
    created_at: string;
    updated_at: string;
  };
  steps: RunStepView[];
  result: {
    version: number;
    engine: string;
    blueprint: AppBlueprint | null;
    diff: string[];
  } | null;
}

export interface RunBrief {
  id: number;
  prompt: string;
  status: string;
  error: string;
  engine: string;
  steps: RunStepView[];
  created_at: string;
}

export interface ProjectDetail {
  project: {
    id: number;
    name: string;
    description: string;
    created_at: string;
    active_version: number | null;
  };
  blueprint: AppBlueprint | null;
  versions: VersionInfo[];
  runs: RunBrief[];
  shareToken: string | null;
  records: RecordData[];
}