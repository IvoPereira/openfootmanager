import { invoke } from "@tauri-apps/api/core";
import type { WorldDatabaseInfo } from "../components/menu/WorldSelect";

export type WorldEditorIssueSeverity = "error" | "warning";

export interface WorldEditorProjectSummary {
  id: string;
  name: string;
  description: string;
  teamCount: number;
  playerCount: number;
  updatedAt: string;
  path: string;
}

export interface EditorConfederation {
  id: string;
  name: string;
}

export interface EditorCountry {
  id: string;
  name: string;
  confederation: string;
}

export interface EditorTeam {
  id: string;
  name: string;
  shortName: string;
  city: string;
  country: string;
  colors: {
    primary: string;
    secondary: string;
  };
  playStyle: string;
  stadiumName: string;
  reputationRange: [number, number] | null;
  financeRange: [number, number] | null;
  stadiumCapacity: number | null;
  kitPattern: string | null;
  media: {
    logo?: string | null;
  };
}

export interface EditorPlayer {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  club: string;
  nationality: string;
  position: string;
  dateOfBirth: string | null;
  age: number | null;
  overall: number | null;
  attributes: Record<string, number> | null;
  media: {
    face?: string | null;
  };
}

export interface EditorLeague {
  id: string;
  name: string;
  countryId: string;
  seasonStartMonth: number;
  seasonStartDay: number;
  legs: number;
  teamIds: string[];
}

export interface WorldEditorProject {
  id: string;
  name: string;
  description: string;
  path: string;
  baseYear: number | null;
  confederations: EditorConfederation[];
  countries: EditorCountry[];
  teams: EditorTeam[];
  players: EditorPlayer[];
  leagues: EditorLeague[];
  updatedAt: string | null;
}

export interface WorldEditorValidationIssue {
  id: string;
  group: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  severity: WorldEditorIssueSeverity;
  message: string;
}

export interface WorldEditorValidationSection {
  id: string;
  label: string;
  passed: number;
  total: number;
  errors: number;
  warnings: number;
}

export interface WorldEditorValidation {
  sections: WorldEditorValidationSection[];
  issues: WorldEditorValidationIssue[];
  blockingIssueCount: number;
  warningCount: number;
}

export async function listWorldEditorProjects(): Promise<WorldEditorProjectSummary[]> {
  return invoke("list_world_editor_projects");
}

export async function createWorldEditorProject(input: {
  name?: string;
  template?: "small" | "blank";
}): Promise<WorldEditorProject> {
  return invoke("create_world_editor_project", {
    name: input.name,
    template: input.template,
  });
}

export async function openWorldEditorProject(projectId: string): Promise<WorldEditorProject> {
  return invoke("open_world_editor_project", { projectId });
}

export async function saveWorldEditorProject(
  project: WorldEditorProject,
): Promise<WorldEditorProject> {
  return invoke("save_world_editor_project", { project });
}

export async function validateWorldEditorProject(
  project: WorldEditorProject,
): Promise<WorldEditorValidation> {
  return invoke("validate_world_editor_project", { project });
}

export async function importWorldEditorAsset(input: {
  projectId: string;
  entityType: "team" | "player";
  entityId: string;
  sourcePath: string;
}): Promise<WorldEditorProject> {
  return invoke("import_world_editor_asset", input);
}

export async function publishWorldEditorProject(
  projectId: string,
): Promise<WorldDatabaseInfo> {
  return invoke("publish_world_editor_project", { projectId });
}
