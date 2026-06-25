import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { open } from "@tauri-apps/plugin-dialog";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronDown,
  Database,
  ImagePlus,
  Loader2,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Upload,
  Users,
  X,
} from "lucide-react";
import { resolveLocalMediaPath } from "../lib/mediaAssets";
import {
  createWorldEditorProject,
  importWorldEditorAsset,
  listWorldEditorProjects,
  openWorldEditorProject,
  publishWorldEditorProject,
  saveWorldEditorProject,
  validateWorldEditorProject,
  type EditorCountry,
  type EditorLeague,
  type EditorPlayer,
  type EditorTeam,
  type WorldEditorProject,
  type WorldEditorProjectSummary,
  type WorldEditorValidation,
  type WorldEditorValidationIssue,
  type WorldEditorValidationSection,
} from "../services/worldEditorService";

type EditorSection = "world" | "leagues" | "teams" | "players" | "media" | "validation";

const SECTION_LABELS: Record<EditorSection, string> = {
  world: "World",
  leagues: "Leagues",
  teams: "Teams",
  players: "Players",
  media: "Media",
  validation: "Validation",
};

const POSITIONS = [
  "Goalkeeper",
  "RightBack",
  "CenterBack",
  "LeftBack",
  "DefensiveMidfielder",
  "CentralMidfielder",
  "AttackingMidfielder",
  "RightWinger",
  "LeftWinger",
  "Striker",
];

const KIT_PATTERNS = ["Solid", "Stripes", "Hoops", "HalfAndHalf", "Diagonal"];
const PLAY_STYLES = ["Balanced", "Attacking", "Defensive", "Possession", "Counter", "HighPress"];

function makeId(source: string, fallback: string): string {
  const slug = source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

function parseOptionalNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDate(value: string | null): string {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

function mediaSrc(project: WorldEditorProject, path: string | null | undefined): string | null {
  if (!path) return null;
  const trimmed = path.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/") || trimmed.includes("://")) {
    return resolveLocalMediaPath(trimmed);
  }
  if (!project.path) {
    return resolveLocalMediaPath(trimmed);
  }
  return resolveLocalMediaPath(`${project.path}/${trimmed}`);
}

function sectionStatus(
  validation: WorldEditorValidation | null,
  sectionId: string,
): WorldEditorValidationSection | null {
  return validation?.sections.find((section) => section.id === sectionId) ?? null;
}

function PreviewImage({
  src,
  label,
  className = "h-12 w-12",
}: {
  src: string | null;
  label: string;
  className?: string;
}) {
  if (!src) {
    return (
      <div
        className={`${className} grid place-items-center rounded-lg border border-dashed border-gray-300 bg-gray-50 text-xs font-bold uppercase text-gray-400 dark:border-navy-500 dark:bg-navy-700 dark:text-gray-500`}
      >
        {label.slice(0, 2).toUpperCase()}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={label}
      className={`${className} rounded-lg border border-gray-200 bg-white object-cover dark:border-navy-600 dark:bg-navy-800`}
      loading="lazy"
    />
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
        {label}
      </span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-navy-600 dark:bg-navy-800 dark:text-white"
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
        {label}
      </span>
      <input
        type="number"
        value={value ?? ""}
        min={min}
        max={max}
        onChange={(event) => onChange(parseOptionalNumber(event.target.value))}
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-navy-600 dark:bg-navy-800 dark:text-white"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-navy-600 dark:bg-navy-800 dark:text-white"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function NavBadge({ section }: { section: WorldEditorValidationSection | null }) {
  if (!section) return null;
  const hasErrors = section.errors > 0;
  const hasWarnings = section.warnings > 0;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
        hasErrors
          ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"
          : hasWarnings
            ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
            : "bg-primary-100 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300"
      }`}
    >
      {section.passed}/{section.total}
    </span>
  );
}

function EntityList<T extends { id: string; name?: string }>({
  items,
  selectedId,
  search,
  onSearch,
  onSelect,
  onAdd,
  emptyLabel,
}: {
  items: T[];
  selectedId: string | null;
  search: string;
  onSearch: (value: string) => void;
  onSelect: (id: string) => void;
  onAdd: () => void;
  emptyLabel: string;
}) {
  const normalizedSearch = search.trim().toLowerCase();
  const filtered = items.filter((item) => {
    const label = (item.name || item.id).toLowerCase();
    return !normalizedSearch || label.includes(normalizedSearch) || item.id.includes(normalizedSearch);
  });

  return (
    <div className="flex min-h-0 flex-col border-r border-gray-200 bg-gray-50 dark:border-navy-700 dark:bg-navy-900/60">
      <div className="border-b border-gray-200 p-3 dark:border-navy-700">
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2 dark:border-navy-600 dark:bg-navy-800">
          <Search className="h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Search"
            className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none dark:text-white"
          />
          <button
            type="button"
            onClick={onAdd}
            className="rounded-md p-1.5 text-primary-600 transition hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-500/10"
            title="Add"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <div className="p-4 text-sm text-gray-500 dark:text-gray-400">{emptyLabel}</div>
        ) : (
          filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={`mb-1 w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                selectedId === item.id
                  ? "bg-primary-100 text-primary-800 ring-1 ring-primary-300 dark:bg-primary-500/15 dark:text-primary-200 dark:ring-primary-500/40"
                  : "text-gray-700 hover:bg-white dark:text-gray-200 dark:hover:bg-navy-800"
              }`}
            >
              <span className="block truncate font-semibold">{item.name || item.id}</span>
              <span className="block truncate text-xs text-gray-400">{item.id}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export default function WorldEditor() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<WorldEditorProjectSummary[]>([]);
  const [project, setProject] = useState<WorldEditorProject | null>(null);
  const [validation, setValidation] = useState<WorldEditorValidation | null>(null);
  const [activeSection, setActiveSection] = useState<EditorSection>("world");
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set(["world"]));
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>("Ready");

  useEffect(() => {
    let cancelled = false;
    void listWorldEditorProjects().then((items) => {
      if (!cancelled) setProjects(items);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      void validateWorldEditorProject(project).then((nextValidation) => {
        if (!cancelled) setValidation(nextValidation);
      });
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [project]);

  const selectedLeague = useMemo(
    () => project?.leagues.find((league) => league.id === selectedLeagueId) ?? project?.leagues[0] ?? null,
    [project?.leagues, selectedLeagueId],
  );
  const selectedTeam = useMemo(
    () => project?.teams.find((team) => team.id === selectedTeamId) ?? project?.teams[0] ?? null,
    [project?.teams, selectedTeamId],
  );
  const selectedPlayer = useMemo(
    () => project?.players.find((player) => player.id === selectedPlayerId) ?? project?.players[0] ?? null,
    [project?.players, selectedPlayerId],
  );

  function mutateProject(updater: (current: WorldEditorProject) => WorldEditorProject) {
    setProject((current) => {
      if (!current) return current;
      setDirty(true);
      return updater(current);
    });
  }

  async function refreshProjects() {
    setProjects(await listWorldEditorProjects());
  }

  async function createProject(template: "small" | "blank") {
    setBusy(true);
    try {
      const nextProject = await createWorldEditorProject({ template });
      setProject(nextProject);
      setDirty(false);
      setSelectedLeagueId(nextProject.leagues[0]?.id ?? null);
      setSelectedTeamId(nextProject.teams[0]?.id ?? null);
      setSelectedPlayerId(nextProject.players[0]?.id ?? null);
      setStatusMessage("Draft created");
      await refreshProjects();
    } finally {
      setBusy(false);
    }
  }

  async function openProject(projectId: string) {
    setBusy(true);
    try {
      const opened = await openWorldEditorProject(projectId);
      setProject(opened);
      setDirty(false);
      setSelectedLeagueId(opened.leagues[0]?.id ?? null);
      setSelectedTeamId(opened.teams[0]?.id ?? null);
      setSelectedPlayerId(opened.players[0]?.id ?? null);
      setStatusMessage("Draft opened");
    } finally {
      setBusy(false);
    }
  }

  async function saveProject() {
    if (!project) return;
    setBusy(true);
    try {
      const saved = await saveWorldEditorProject(project);
      setProject(saved);
      setDirty(false);
      setStatusMessage("Saved");
      await refreshProjects();
    } finally {
      setBusy(false);
    }
  }

  async function publishProject() {
    if (!project) return;
    setBusy(true);
    try {
      const saved = dirty ? await saveWorldEditorProject(project) : project;
      setProject(saved);
      setDirty(false);
      const result = await publishWorldEditorProject(saved.id);
      setStatusMessage(`Published: ${result.name}`);
      await refreshProjects();
    } catch (error) {
      setStatusMessage(typeof error === "string" ? error : "Publish failed");
    } finally {
      setBusy(false);
    }
  }

  async function importAsset(entityType: "team" | "player", entityId: string) {
    if (!project) return;
    const selected = await open({
      multiple: false,
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "svg"] }],
    });
    if (typeof selected !== "string") return;
    setBusy(true);
    try {
      const updated = await importWorldEditorAsset({
        projectId: project.id,
        entityType,
        entityId,
        sourcePath: selected,
      });
      setProject(updated);
      setDirty(false);
      setStatusMessage("Asset imported");
    } finally {
      setBusy(false);
    }
  }

  function addCountry() {
    mutateProject((current) => ({
      ...current,
      countries: [
        ...current.countries,
        {
          id: `C${current.countries.length + 1}`,
          name: "New Country",
          confederation: current.confederations[0]?.id ?? "world",
        },
      ],
    }));
  }

  function updateCountry(id: string, patch: Partial<EditorCountry>) {
    mutateProject((current) => ({
      ...current,
      countries: current.countries.map((country) =>
        country.id === id ? { ...country, ...patch } : country,
      ),
    }));
  }

  function addLeague() {
    if (!project) return;
    const id = `league-${project.leagues.length + 1}`;
    const countryId = project.countries[0]?.id ?? "";
    mutateProject((current) => ({
      ...current,
      leagues: [
        ...current.leagues,
        {
          id,
          name: "New League",
          countryId,
          seasonStartMonth: 8,
          seasonStartDay: 1,
          legs: 2,
          teamIds: current.teams.filter((team) => team.country === countryId).map((team) => team.id),
        },
      ],
    }));
    setSelectedLeagueId(id);
  }

  function updateLeague(id: string, patch: Partial<EditorLeague>) {
    mutateProject((current) => ({
      ...current,
      leagues: current.leagues.map((league) =>
        league.id === id ? { ...league, ...patch } : league,
      ),
    }));
    if (patch.id && patch.id !== id) setSelectedLeagueId(patch.id);
  }

  function addTeam() {
    if (!project) return;
    const id = `team-${project.teams.length + 1}`;
    const country = project.countries[0]?.id ?? "";
    const team: EditorTeam = {
      id,
      name: "New Team",
      shortName: "NEW",
      city: "City",
      country,
      colors: { primary: "#10b981", secondary: "#ffffff" },
      playStyle: "Balanced",
      stadiumName: "City Ground",
      reputationRange: [350, 600],
      financeRange: [500000, 2500000],
      stadiumCapacity: 18000,
      kitPattern: "Solid",
      media: {},
    };
    mutateProject((current) => ({ ...current, teams: [...current.teams, team] }));
    setSelectedTeamId(id);
  }

  function updateTeam(id: string, patch: Partial<EditorTeam>) {
    mutateProject((current) => {
      const nextId = patch.id ?? id;
      return {
        ...current,
        teams: current.teams.map((team) => (team.id === id ? { ...team, ...patch } : team)),
        players: nextId === id
          ? current.players
          : current.players.map((player) => player.club === id ? { ...player, club: nextId } : player),
        leagues: nextId === id
          ? current.leagues
          : current.leagues.map((league) => ({
              ...league,
              teamIds: league.teamIds.map((teamId) => teamId === id ? nextId : teamId),
            })),
      };
    });
    if (patch.id && patch.id !== id) setSelectedTeamId(patch.id);
  }

  function addPlayer() {
    if (!project) return;
    const teamId = selectedTeam?.id ?? project.teams[0]?.id ?? "";
    const id = `player-${project.players.length + 1}`;
    const player: EditorPlayer = {
      id,
      name: "New Player",
      firstName: "New",
      lastName: "Player",
      club: teamId,
      nationality: project.countries[0]?.id ?? "",
      position: "CentralMidfielder",
      dateOfBirth: null,
      age: 22,
      overall: 62,
      attributes: null,
      media: {},
    };
    mutateProject((current) => ({ ...current, players: [...current.players, player] }));
    setSelectedPlayerId(id);
  }

  function updatePlayer(id: string, patch: Partial<EditorPlayer>) {
    mutateProject((current) => ({
      ...current,
      players: current.players.map((player) =>
        player.id === id ? { ...player, ...patch } : player,
      ),
    }));
    if (patch.id && patch.id !== id) setSelectedPlayerId(patch.id);
  }

  function toggleLeagueTeam(league: EditorLeague, teamId: string) {
    const exists = league.teamIds.includes(teamId);
    updateLeague(league.id, {
      teamIds: exists
        ? league.teamIds.filter((candidate) => candidate !== teamId)
        : [...league.teamIds, teamId],
    });
  }

  function jumpToIssue(issue: WorldEditorValidationIssue) {
    if (issue.group === "media") {
      setActiveSection("media");
    } else if (issue.group in SECTION_LABELS) {
      setActiveSection(issue.group as EditorSection);
    }
    if (issue.entityType === "league") setSelectedLeagueId(issue.entityId);
    if (issue.entityType === "team") setSelectedTeamId(issue.entityId);
    if (issue.entityType === "player") setSelectedPlayerId(issue.entityId);
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-gray-100 text-gray-900 dark:bg-navy-900 dark:text-white">
        <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-8">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="mb-8 inline-flex w-fit items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-gray-500 transition hover:bg-white hover:text-gray-900 dark:text-gray-400 dark:hover:bg-navy-800 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Main menu
          </button>

          <div className="grid flex-1 items-center gap-8 lg:grid-cols-[1fr_420px]">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.24em] text-primary-600 dark:text-primary-300">
                OpenFoot Manager
              </p>
              <h1 className="mt-3 font-heading text-5xl font-bold uppercase tracking-wide text-gray-950 dark:text-white">
                World Editor
              </h1>
              <p className="mt-4 max-w-2xl text-lg text-gray-600 dark:text-gray-300">
                Build a playable football world with leagues, clubs, squads, logos, and player photos before starting a career.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void createProject("small")}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-3 font-heading text-sm font-bold uppercase tracking-wide text-white shadow-lg shadow-primary-900/10 transition hover:bg-primary-700 disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Small template
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void createProject("blank")}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-3 font-heading text-sm font-bold uppercase tracking-wide text-gray-800 transition hover:border-primary-400 dark:border-navy-600 dark:bg-navy-800 dark:text-gray-100"
                >
                  <Database className="h-4 w-4" />
                  Blank world
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-xl dark:border-navy-700 dark:bg-navy-800">
              <div className="border-b border-gray-200 px-2 pb-3 dark:border-navy-700">
                <h2 className="font-heading text-xl font-bold uppercase tracking-wide">Drafts</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Open a saved editor project.</p>
              </div>
              <div className="max-h-[460px] overflow-y-auto py-2">
                {projects.length === 0 ? (
                  <div className="p-4 text-sm text-gray-500 dark:text-gray-400">
                    No editor drafts yet.
                  </div>
                ) : (
                  projects.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => void openProject(item.id)}
                      className="mb-2 w-full rounded-lg border border-gray-200 p-3 text-left transition hover:border-primary-300 hover:bg-primary-50 dark:border-navy-700 dark:hover:border-primary-500/50 dark:hover:bg-primary-500/10"
                    >
                      <span className="block font-semibold">{item.name || "Untitled world"}</span>
                      <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                        {item.teamCount} teams - {item.playerCount} players - {formatDate(item.updatedAt)}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const navItems: EditorSection[] = ["world", "leagues", "teams", "players", "media", "validation"];
  const selectedSectionStatus = validation?.sections.find((section) => section.id === activeSection);
  const canPublish = validation ? validation.blockingIssueCount === 0 : false;

  return (
    <div className="flex h-screen min-h-[640px] bg-gray-100 text-gray-900 dark:bg-navy-900 dark:text-white">
      <aside className="flex w-64 shrink-0 flex-col border-r border-gray-200 bg-white dark:border-navy-700 dark:bg-navy-800">
        <div className="border-b border-gray-200 p-4 dark:border-navy-700">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="mb-4 inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-navy-700 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Main menu
          </button>
          <h1 className="truncate font-heading text-2xl font-bold uppercase tracking-wide">
            {project.name || "Untitled world"}
          </h1>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {project.teams.length} teams - {project.players.length} players
          </p>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((item) => {
            const Icon = item === "world" ? Database : item === "validation" ? ShieldCheck : item === "media" ? ImagePlus : Users;
            const status = item === "validation"
              ? selectedSectionStatus ?? null
              : sectionStatus(validation, item);
            return (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setActiveSection(item);
                  setSearch("");
                }}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition ${
                  activeSection === item
                    ? "bg-primary-50 text-primary-800 ring-1 ring-primary-200 dark:bg-primary-500/15 dark:text-primary-200 dark:ring-primary-500/30"
                    : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-navy-700"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{SECTION_LABELS[item]}</span>
                </span>
                {item === "validation" ? (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      validation?.blockingIssueCount
                        ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"
                        : "bg-primary-100 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300"
                    }`}
                  >
                    {validation?.blockingIssueCount ?? 0}
                  </span>
                ) : (
                  <NavBadge section={status} />
                )}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-gray-200 p-3 text-xs text-gray-500 dark:border-navy-700 dark:text-gray-400">
          <div className="flex items-center justify-between">
            <span>{dirty ? "Unsaved changes" : "Saved draft"}</span>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          </div>
          <p className="mt-1 truncate">{statusMessage}</p>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-5 dark:border-navy-700 dark:bg-navy-800">
          <div>
            <h2 className="font-heading text-2xl font-bold uppercase tracking-wide">
              {SECTION_LABELS[activeSection]}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {validation
                ? `${validation.blockingIssueCount} blocking issues, ${validation.warningCount} warnings`
                : "Checking draft"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveProject()}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:border-primary-400 disabled:opacity-60 dark:border-navy-600 dark:bg-navy-700 dark:text-gray-100"
            >
              <Save className="h-4 w-4" />
              Save
            </button>
            <button
              type="button"
              disabled={busy || !canPublish}
              onClick={() => void publishProject()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 dark:disabled:bg-navy-600 dark:disabled:text-gray-400"
              title={canPublish ? "Publish to world picker" : "Fix blocking validation issues first"}
            >
              <Upload className="h-4 w-4" />
              Publish
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1">
          {activeSection === "world" ? (
            <WorldPanel
              project={project}
              onProjectChange={(patch) => mutateProject((current) => ({ ...current, ...patch }))}
              onAddCountry={addCountry}
              onCountryChange={updateCountry}
            />
          ) : null}

          {activeSection === "leagues" ? (
            <div className="grid h-full grid-cols-[280px_1fr]">
              <EntityList
                items={project.leagues}
                selectedId={selectedLeague?.id ?? null}
                search={search}
                onSearch={setSearch}
                onSelect={setSelectedLeagueId}
                onAdd={addLeague}
                emptyLabel="No leagues yet."
              />
              <LeaguePanel
                league={selectedLeague}
                countries={project.countries}
                teams={project.teams}
                onChange={updateLeague}
                onToggleTeam={toggleLeagueTeam}
              />
            </div>
          ) : null}

          {activeSection === "teams" ? (
            <div className="grid h-full grid-cols-[280px_1fr]">
              <EntityList
                items={project.teams}
                selectedId={selectedTeam?.id ?? null}
                search={search}
                onSearch={setSearch}
                onSelect={setSelectedTeamId}
                onAdd={addTeam}
                emptyLabel="No teams yet."
              />
              <TeamPanel
                project={project}
                team={selectedTeam}
                countries={project.countries}
                onChange={updateTeam}
                onImportAsset={(teamId) => void importAsset("team", teamId)}
              />
            </div>
          ) : null}

          {activeSection === "players" ? (
            <div className="grid h-full grid-cols-[280px_1fr]">
              <EntityList
                items={project.players}
                selectedId={selectedPlayer?.id ?? null}
                search={search}
                onSearch={setSearch}
                onSelect={setSelectedPlayerId}
                onAdd={addPlayer}
                emptyLabel="No players yet."
              />
              <PlayerPanel
                project={project}
                player={selectedPlayer}
                teams={project.teams}
                countries={project.countries}
                onChange={updatePlayer}
                onImportAsset={(playerId) => void importAsset("player", playerId)}
              />
            </div>
          ) : null}

          {activeSection === "media" ? (
            <MediaPanel
              project={project}
              onImportTeam={(teamId) => void importAsset("team", teamId)}
              onImportPlayer={(playerId) => void importAsset("player", playerId)}
            />
          ) : null}

          {activeSection === "validation" ? (
            <ValidationPanel
              validation={validation}
              expandedGroups={expandedGroups}
              onToggleGroup={(group) => {
                setExpandedGroups((current) => {
                  const next = new Set(current);
                  if (next.has(group)) next.delete(group);
                  else next.add(group);
                  return next;
                });
              }}
              onIssueClick={jumpToIssue}
            />
          ) : null}
        </div>
      </main>
    </div>
  );
}

function WorldPanel({
  project,
  onProjectChange,
  onAddCountry,
  onCountryChange,
}: {
  project: WorldEditorProject;
  onProjectChange: (patch: Partial<WorldEditorProject>) => void;
  onAddCountry: () => void;
  onCountryChange: (id: string, patch: Partial<EditorCountry>) => void;
}) {
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-navy-700 dark:bg-navy-800">
          <h3 className="font-heading text-xl font-bold uppercase tracking-wide">Identity</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <TextField label="World name" value={project.name} onChange={(name) => onProjectChange({ name })} />
            <NumberField
              label="Base year"
              value={project.baseYear}
              onChange={(baseYear) => onProjectChange({ baseYear })}
              min={1900}
              max={2100}
            />
          </div>
          <label className="mt-4 block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
              Description
            </span>
            <textarea
              value={project.description}
              onChange={(event) => onProjectChange({ description: event.target.value })}
              rows={5}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-navy-600 dark:bg-navy-800 dark:text-white"
            />
          </label>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-navy-700 dark:bg-navy-800">
          <div className="flex items-center justify-between">
            <h3 className="font-heading text-xl font-bold uppercase tracking-wide">Countries</h3>
            <button
              type="button"
              onClick={onAddCountry}
              className="rounded-lg bg-primary-50 p-2 text-primary-700 transition hover:bg-primary-100 dark:bg-primary-500/15 dark:text-primary-200"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 space-y-3">
            {project.countries.map((country) => (
              <div key={country.id} className="grid grid-cols-[86px_1fr] gap-2">
                <input
                  value={country.id}
                  onChange={(event) => onCountryChange(country.id, { id: event.target.value.toUpperCase() })}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-bold uppercase outline-none focus:border-primary-500 dark:border-navy-600 dark:bg-navy-900 dark:text-white"
                />
                <input
                  value={country.name}
                  onChange={(event) => onCountryChange(country.id, { name: event.target.value })}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-500 dark:border-navy-600 dark:bg-navy-900 dark:text-white"
                />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function LeaguePanel({
  league,
  countries,
  teams,
  onChange,
  onToggleTeam,
}: {
  league: EditorLeague | null;
  countries: EditorCountry[];
  teams: EditorTeam[];
  onChange: (id: string, patch: Partial<EditorLeague>) => void;
  onToggleTeam: (league: EditorLeague, teamId: string) => void;
}) {
  if (!league) return <EmptyEditor label="Select or add a league." />;
  return (
    <div className="h-full overflow-y-auto p-6">
      <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-navy-700 dark:bg-navy-800">
        <h3 className="font-heading text-xl font-bold uppercase tracking-wide">League Setup</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <TextField label="League id" value={league.id} onChange={(id) => onChange(league.id, { id: makeId(id, league.id) })} />
          <TextField label="League name" value={league.name} onChange={(name) => onChange(league.id, { name })} />
          <SelectField
            label="Country"
            value={league.countryId}
            options={countries.map((country) => country.id)}
            onChange={(countryId) => onChange(league.id, { countryId })}
          />
          <NumberField label="Legs" value={league.legs} min={1} max={4} onChange={(legs) => onChange(league.id, { legs: legs ?? 1 })} />
          <NumberField label="Start month" value={league.seasonStartMonth} min={1} max={12} onChange={(seasonStartMonth) => onChange(league.id, { seasonStartMonth: seasonStartMonth ?? 8 })} />
          <NumberField label="Start day" value={league.seasonStartDay} min={1} max={31} onChange={(seasonStartDay) => onChange(league.id, { seasonStartDay: seasonStartDay ?? 1 })} />
        </div>
      </section>

      <section className="mt-5 rounded-xl border border-gray-200 bg-white p-5 dark:border-navy-700 dark:bg-navy-800">
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-xl font-bold uppercase tracking-wide">Teams</h3>
          <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-bold text-gray-600 dark:bg-navy-700 dark:text-gray-300">
            {league.teamIds.length} selected
          </span>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {teams.map((team) => {
            const checked = league.teamIds.includes(team.id);
            return (
              <button
                key={team.id}
                type="button"
                onClick={() => onToggleTeam(league, team.id)}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${
                  checked
                    ? "border-primary-400 bg-primary-50 text-primary-800 dark:border-primary-500/50 dark:bg-primary-500/15 dark:text-primary-200"
                    : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-white dark:border-navy-700 dark:bg-navy-900 dark:text-gray-200 dark:hover:bg-navy-800"
                }`}
              >
                <span className="truncate font-semibold">{team.name}</span>
                {checked ? <Check className="h-4 w-4 shrink-0" /> : null}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function TeamPanel({
  project,
  team,
  countries,
  onChange,
  onImportAsset,
}: {
  project: WorldEditorProject;
  team: EditorTeam | null;
  countries: EditorCountry[];
  onChange: (id: string, patch: Partial<EditorTeam>) => void;
  onImportAsset: (teamId: string) => void;
}) {
  if (!team) return <EmptyEditor label="Select or add a team." />;
  return (
    <div className="h-full overflow-y-auto p-6">
      <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-navy-700 dark:bg-navy-800">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-heading text-xl font-bold uppercase tracking-wide">Club Details</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Identity, stadium, colors, and logo.</p>
          </div>
          <div className="flex items-center gap-3">
            <PreviewImage src={mediaSrc(project, team.media.logo)} label={team.shortName || team.name} />
            <button
              type="button"
              onClick={() => onImportAsset(team.id)}
              className="rounded-lg border border-gray-200 p-2 text-gray-500 transition hover:border-primary-400 hover:text-primary-600 dark:border-navy-600 dark:text-gray-300"
              title="Import logo"
            >
              <ImagePlus className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <TextField label="Team id" value={team.id} onChange={(id) => onChange(team.id, { id: makeId(id, team.id) })} />
          <TextField label="Name" value={team.name} onChange={(name) => onChange(team.id, { name })} />
          <TextField label="Short name" value={team.shortName} onChange={(shortName) => onChange(team.id, { shortName: shortName.toUpperCase().slice(0, 5) })} />
          <TextField label="City" value={team.city} onChange={(city) => onChange(team.id, { city })} />
          <SelectField label="Country" value={team.country} options={countries.map((country) => country.id)} onChange={(country) => onChange(team.id, { country })} />
          <TextField label="Stadium" value={team.stadiumName} onChange={(stadiumName) => onChange(team.id, { stadiumName })} />
          <NumberField label="Capacity" value={team.stadiumCapacity} min={1000} onChange={(stadiumCapacity) => onChange(team.id, { stadiumCapacity })} />
          <SelectField label="Play style" value={team.playStyle} options={PLAY_STYLES} onChange={(playStyle) => onChange(team.id, { playStyle })} />
          <SelectField label="Kit pattern" value={team.kitPattern ?? "Solid"} options={KIT_PATTERNS} onChange={(kitPattern) => onChange(team.id, { kitPattern })} />
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Primary</span>
            <input type="color" value={team.colors.primary} onChange={(event) => onChange(team.id, { colors: { ...team.colors, primary: event.target.value } })} className="h-10 w-full rounded-lg border border-gray-200 bg-white p-1 dark:border-navy-600 dark:bg-navy-800" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Secondary</span>
            <input type="color" value={team.colors.secondary} onChange={(event) => onChange(team.id, { colors: { ...team.colors, secondary: event.target.value } })} className="h-10 w-full rounded-lg border border-gray-200 bg-white p-1 dark:border-navy-600 dark:bg-navy-800" />
          </label>
        </div>
      </section>
    </div>
  );
}

function PlayerPanel({
  project,
  player,
  teams,
  countries,
  onChange,
  onImportAsset,
}: {
  project: WorldEditorProject;
  player: EditorPlayer | null;
  teams: EditorTeam[];
  countries: EditorCountry[];
  onChange: (id: string, patch: Partial<EditorPlayer>) => void;
  onImportAsset: (playerId: string) => void;
}) {
  if (!player) return <EmptyEditor label="Select or add a player." />;
  return (
    <div className="h-full overflow-y-auto p-6">
      <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-navy-700 dark:bg-navy-800">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-heading text-xl font-bold uppercase tracking-wide">Player Details</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Basics first, advanced attributes can come later.</p>
          </div>
          <div className="flex items-center gap-3">
            <PreviewImage src={mediaSrc(project, player.media.face)} label={player.name} className="h-14 w-14" />
            <button
              type="button"
              onClick={() => onImportAsset(player.id)}
              className="rounded-lg border border-gray-200 p-2 text-gray-500 transition hover:border-primary-400 hover:text-primary-600 dark:border-navy-600 dark:text-gray-300"
              title="Import face"
            >
              <ImagePlus className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <TextField label="Player id" value={player.id} onChange={(id) => onChange(player.id, { id: makeId(id, player.id) })} />
          <TextField label="Display name" value={player.name} onChange={(name) => onChange(player.id, { name })} />
          <TextField label="First name" value={player.firstName} onChange={(firstName) => onChange(player.id, { firstName })} />
          <TextField label="Last name" value={player.lastName} onChange={(lastName) => onChange(player.id, { lastName })} />
          <SelectField label="Club" value={player.club} options={teams.map((team) => team.id)} onChange={(club) => onChange(player.id, { club })} />
          <SelectField label="Nationality" value={player.nationality} options={countries.map((country) => country.id)} onChange={(nationality) => onChange(player.id, { nationality })} />
          <SelectField label="Position" value={player.position} options={POSITIONS} onChange={(position) => onChange(player.id, { position })} />
          <NumberField label="Age" value={player.age} min={15} max={45} onChange={(age) => onChange(player.id, { age, dateOfBirth: age === null ? player.dateOfBirth : null })} />
          <NumberField label="Overall" value={player.overall} min={1} max={99} onChange={(overall) => onChange(player.id, { overall })} />
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
              Date of birth
            </span>
            <input
              type="date"
              value={player.dateOfBirth ?? ""}
              onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(player.id, { dateOfBirth: event.target.value || null, age: event.target.value ? null : player.age })}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-navy-600 dark:bg-navy-800 dark:text-white"
            />
          </label>
        </div>
      </section>
    </div>
  );
}

function MediaPanel({
  project,
  onImportTeam,
  onImportPlayer,
}: {
  project: WorldEditorProject;
  onImportTeam: (teamId: string) => void;
  onImportPlayer: (playerId: string) => void;
}) {
  return (
    <div className="h-full overflow-y-auto p-6">
      <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-navy-700 dark:bg-navy-800">
        <h3 className="font-heading text-xl font-bold uppercase tracking-wide">Team Logos</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {project.teams.map((team) => (
            <button
              key={team.id}
              type="button"
              onClick={() => onImportTeam(team.id)}
              className="flex items-center gap-3 rounded-lg border border-gray-200 p-3 text-left transition hover:border-primary-400 dark:border-navy-700"
            >
              <PreviewImage src={mediaSrc(project, team.media.logo)} label={team.shortName || team.name} />
              <span className="min-w-0">
                <span className="block truncate font-semibold">{team.name}</span>
                <span className="block text-xs text-gray-500">Logo</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="mt-5 rounded-xl border border-gray-200 bg-white p-5 dark:border-navy-700 dark:bg-navy-800">
        <h3 className="font-heading text-xl font-bold uppercase tracking-wide">Player Photos</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {project.players.map((player) => (
            <button
              key={player.id}
              type="button"
              onClick={() => onImportPlayer(player.id)}
              className="flex items-center gap-3 rounded-lg border border-gray-200 p-3 text-left transition hover:border-primary-400 dark:border-navy-700"
            >
              <PreviewImage src={mediaSrc(project, player.media.face)} label={player.name} />
              <span className="min-w-0">
                <span className="block truncate font-semibold">{player.name}</span>
                <span className="block text-xs text-gray-500">Face photo</span>
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function ValidationPanel({
  validation,
  expandedGroups,
  onToggleGroup,
  onIssueClick,
}: {
  validation: WorldEditorValidation | null;
  expandedGroups: Set<string>;
  onToggleGroup: (group: string) => void;
  onIssueClick: (issue: WorldEditorValidationIssue) => void;
}) {
  if (!validation) {
    return (
      <div className="grid h-full place-items-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-5 rounded-xl border border-gray-200 bg-white p-5 dark:border-navy-700 dark:bg-navy-800">
        <div className="flex items-center gap-3">
          {validation.blockingIssueCount === 0 ? (
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary-100 text-primary-700 dark:bg-primary-500/15 dark:text-primary-200">
              <ShieldCheck className="h-5 w-5" />
            </div>
          ) : (
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300">
              <AlertCircle className="h-5 w-5" />
            </div>
          )}
          <div>
            <h3 className="font-heading text-xl font-bold uppercase tracking-wide">
              {validation.blockingIssueCount === 0 ? "Ready to publish" : "Needs attention"}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {validation.blockingIssueCount} blocking issues and {validation.warningCount} warnings.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {validation.sections.map((section) => {
          const sectionIssues = validation.issues.filter((issue) => issue.group === section.id);
          const expanded = expandedGroups.has(section.id);
          return (
            <section key={section.id} className="rounded-xl border border-gray-200 bg-white dark:border-navy-700 dark:bg-navy-800">
              <button
                type="button"
                onClick={() => onToggleGroup(section.id)}
                className="flex w-full items-center justify-between gap-3 p-4 text-left"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className={`grid h-8 w-8 place-items-center rounded-lg ${
                    section.errors
                      ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"
                      : section.warnings
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                        : "bg-primary-100 text-primary-700 dark:bg-primary-500/15 dark:text-primary-200"
                  }`}>
                    {section.errors ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                  </span>
                  <span>
                    <span className="block font-heading text-lg font-bold uppercase tracking-wide">{section.label}</span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400">
                      {section.passed}/{section.total} complete
                    </span>
                  </span>
                </span>
                <ChevronDown className={`h-5 w-5 text-gray-400 transition ${expanded ? "rotate-180" : ""}`} />
              </button>
              {expanded ? (
                <div className="border-t border-gray-200 p-3 dark:border-navy-700">
                  {sectionIssues.length === 0 ? (
                    <div className="rounded-lg bg-primary-50 px-3 py-2 text-sm text-primary-800 dark:bg-primary-500/10 dark:text-primary-200">
                      All checks in this section are clear.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {sectionIssues.map((issue) => (
                        <button
                          key={issue.id}
                          type="button"
                          onClick={() => onIssueClick(issue)}
                          className={`flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${
                            issue.severity === "error"
                              ? "bg-red-50 text-red-800 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-200"
                              : "bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-200"
                          }`}
                        >
                          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                          <span>
                            <span className="block font-semibold">{issue.entityLabel}</span>
                            <span className="block">{issue.message}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function EmptyEditor({ label }: { label: string }) {
  return (
    <div className="grid h-full place-items-center text-sm text-gray-500 dark:text-gray-400">
      {label}
    </div>
  );
}
