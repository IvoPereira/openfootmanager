use std::collections::HashSet;
use std::path::{Path, PathBuf};

use chrono::Utc;
use domain::league::{CompetitionFormat, CompetitionScope, CompetitionType};
use domain::team::KitPattern;
use ofm_core::generator::package::{
    ConfederationDef, CountryDef, PlayerDef, PlayerMediaDef, WorldMetaDef,
};
use ofm_core::generator::{
    CompetitionDefinition, FormatDef, ParticipantSpec, TeamColorsDef, TeamDef, TeamMediaDef,
    WorldDataKind, WorldDatabaseInfo,
};
use serde::{Deserialize, Serialize};
use tauri::Manager as TauriManager;
use uuid::Uuid;

const EDITOR_DIR: &str = "world_editor_projects";
const DATABASES_DIR: &str = "databases";
const WORLD_FILE: &str = "world.yaml";
const CONFEDERATIONS_FILE: &str = "confederations.yaml";
const COUNTRIES_FILE: &str = "countries.yaml";
const TEAMS_FILE: &str = "teams.yaml";
const PLAYERS_FILE: &str = "players.yaml";
const COMPETITIONS_FILE: &str = "competitions.yaml";

const READ_FAILED: &str = "be.error.worldEditor.readFailed";
const WRITE_FAILED: &str = "be.error.worldEditor.writeFailed";
const PROJECT_NOT_FOUND: &str = "be.error.worldEditor.projectNotFound";
const VALIDATION_FAILED: &str = "be.error.worldEditor.validationFailed";
const ASSET_COPY_FAILED: &str = "be.error.worldEditor.assetCopyFailed";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldEditorProjectSummary {
    pub id: String,
    pub name: String,
    pub description: String,
    pub team_count: usize,
    pub player_count: usize,
    pub updated_at: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorLeague {
    pub id: String,
    pub name: String,
    pub country_id: String,
    pub season_start_month: u8,
    pub season_start_day: u8,
    pub legs: u8,
    pub team_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldEditorProject {
    pub id: String,
    pub name: String,
    pub description: String,
    pub path: String,
    pub base_year: Option<i32>,
    pub confederations: Vec<ConfederationDef>,
    pub countries: Vec<CountryDef>,
    pub teams: Vec<TeamDef>,
    pub players: Vec<PlayerDef>,
    pub leagues: Vec<EditorLeague>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum WorldEditorIssueSeverity {
    Error,
    Warning,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldEditorValidationIssue {
    pub id: String,
    pub group: String,
    pub entity_type: String,
    pub entity_id: String,
    pub entity_label: String,
    pub severity: WorldEditorIssueSeverity,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldEditorValidationSection {
    pub id: String,
    pub label: String,
    pub passed: usize,
    pub total: usize,
    pub errors: usize,
    pub warnings: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldEditorValidation {
    pub sections: Vec<WorldEditorValidationSection>,
    pub issues: Vec<WorldEditorValidationIssue>,
    pub blocking_issue_count: usize,
    pub warning_count: usize,
}

#[derive(Serialize)]
struct SingleFile<'a, T: Serialize> {
    schema: &'static str,
    #[serde(flatten)]
    item: &'a T,
}

#[derive(Serialize)]
struct BulkFile<'a, T: Serialize> {
    schema: &'static str,
    items: &'a [T],
}

fn app_editor_root(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app_handle
        .path()
        .app_data_dir()
        .map_err(|_| READ_FAILED.to_string())?
        .join(EDITOR_DIR))
}

fn app_databases_root(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app_handle
        .path()
        .app_data_dir()
        .map_err(|_| READ_FAILED.to_string())?
        .join(DATABASES_DIR))
}

fn project_dir(app_handle: &tauri::AppHandle, project_id: &str) -> Result<PathBuf, String> {
    let root = app_editor_root(app_handle)?;
    Ok(root.join(sanitize_filename(project_id)))
}

fn now_string() -> String {
    Utc::now().to_rfc3339()
}

fn sanitize_filename(value: &str) -> String {
    let mut out = String::new();
    for ch in value.chars() {
        if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
            out.push(ch.to_ascii_lowercase());
        } else if ch.is_whitespace() || ch == '.' {
            out.push('-');
        }
    }
    while out.contains("--") {
        out = out.replace("--", "-");
    }
    out.trim_matches('-').to_string()
}

fn slug_for_project(project: &WorldEditorProject) -> String {
    let slug = sanitize_filename(&project.name);
    if slug.is_empty() {
        sanitize_filename(&project.id)
    } else {
        slug
    }
}

fn write_yaml<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let yaml = serde_yaml::to_string(value).map_err(|_| WRITE_FAILED.to_string())?;
    std::fs::write(path, yaml).map_err(|_| WRITE_FAILED.to_string())
}

fn write_project_to_dir(project: &WorldEditorProject, dir: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|_| WRITE_FAILED.to_string())?;

    let meta = WorldMetaDef {
        name: project.name.clone(),
        description: project.description.clone(),
        default_active_regions: project
            .confederations
            .iter()
            .map(|confederation| confederation.id.clone())
            .collect(),
        default_active_competitions: project.leagues.iter().map(|league| league.id.clone()).collect(),
        base_year: project.base_year,
    };

    write_yaml(
        &dir.join(WORLD_FILE),
        &SingleFile {
            schema: "world",
            item: &meta,
        },
    )?;
    write_yaml(
        &dir.join(CONFEDERATIONS_FILE),
        &BulkFile {
            schema: "confederation",
            items: &project.confederations,
        },
    )?;
    write_yaml(
        &dir.join(COUNTRIES_FILE),
        &BulkFile {
            schema: "country",
            items: &project.countries,
        },
    )?;
    write_yaml(
        &dir.join(TEAMS_FILE),
        &BulkFile {
            schema: "team",
            items: &project.teams,
        },
    )?;
    write_yaml(
        &dir.join(PLAYERS_FILE),
        &BulkFile {
            schema: "player",
            items: &project.players,
        },
    )?;

    let competitions: Vec<CompetitionDefinition> =
        project.leagues.iter().map(league_to_definition).collect();
    write_yaml(
        &dir.join(COMPETITIONS_FILE),
        &BulkFile {
            schema: "competition",
            items: &competitions,
        },
    )
}

fn league_to_definition(league: &EditorLeague) -> CompetitionDefinition {
    CompetitionDefinition {
        id: league.id.clone(),
        name: league.name.clone(),
        r#type: CompetitionType::League,
        scope: CompetitionScope::Domestic,
        region_id: None,
        country_id: Some(league.country_id.clone()),
        required_region_ids: Vec::new(),
        priority: 100,
        format: FormatDef {
            kind: CompetitionFormat::LeagueTable,
            legs: Some(league.legs.max(1)),
            group_size: None,
            qualifiers_per_group: None,
            best_third_qualifiers: None,
        },
        participants: ParticipantSpec {
            explicit: Some(league.team_ids.clone()),
            selector: None,
        },
        berths: Vec::new(),
        season_start_month: Some(league.season_start_month),
        season_start_day: Some(league.season_start_day),
    }
}

fn definition_to_league(definition: &CompetitionDefinition) -> Option<EditorLeague> {
    if definition.r#type != CompetitionType::League {
        return None;
    }

    let country_id = definition
        .country_id
        .clone()
        .or_else(|| {
            definition
                .participants
                .selector
                .as_ref()
                .and_then(|selector| selector.country.clone())
        })
        .unwrap_or_default();
    let team_ids = definition
        .participants
        .explicit
        .clone()
        .unwrap_or_default();

    Some(EditorLeague {
        id: definition.id.clone(),
        name: definition.name.clone(),
        country_id,
        season_start_month: definition.season_start_month.unwrap_or(8),
        season_start_day: definition.season_start_day.unwrap_or(1),
        legs: definition.format.legs.unwrap_or(2),
        team_ids,
    })
}

fn load_project_from_dir(id: String, dir: &Path) -> Result<WorldEditorProject, String> {
    let (package, errors) = ofm_core::generator::load_world_package(dir);
    if !errors.is_empty() {
        return Err(READ_FAILED.to_string());
    }
    let meta = package.meta.unwrap_or_default();
    let updated_at = dir
        .metadata()
        .and_then(|metadata| metadata.modified())
        .ok()
        .map(chrono::DateTime::<Utc>::from)
        .map(|date| date.to_rfc3339());

    Ok(WorldEditorProject {
        id,
        name: meta.name,
        description: meta.description,
        path: dir.to_string_lossy().to_string(),
        base_year: meta.base_year,
        confederations: package.confederations,
        countries: package.countries,
        teams: package.teams,
        players: package.players,
        leagues: package
            .competitions
            .iter()
            .filter_map(definition_to_league)
            .collect(),
        updated_at,
    })
}

fn sample_project(name: Option<String>) -> WorldEditorProject {
    let world_id = Uuid::new_v4().to_string();
    let world_name = name
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "New Editor World".to_string());
    let teams = vec![
        team("northbank-fc", "Northbank FC", "NFC", "London", "#0f766e", "#f8fafc"),
        team("rivergate-city", "Rivergate City", "RGC", "Liverpool", "#2563eb", "#facc15"),
        team("ironworks-athletic", "Ironworks Athletic", "IWA", "Birmingham", "#111827", "#f97316"),
        team("harbour-rovers", "Harbour Rovers", "HRV", "Bristol", "#be123c", "#e5e7eb"),
    ];
    let mut players = Vec::new();
    for team in &teams {
        for index in 0..5 {
            players.push(player_for_team(team, index));
        }
    }
    let team_ids = teams.iter().map(|team| team.id.clone()).collect();

    WorldEditorProject {
        id: world_id,
        name: world_name,
        description: "A compact editable football world.".to_string(),
        path: String::new(),
        base_year: Some(2026),
        confederations: vec![ConfederationDef {
            id: "europe".to_string(),
            name: "Europe".to_string(),
        }],
        countries: vec![CountryDef {
            id: "ENG".to_string(),
            name: "England".to_string(),
            confederation: "europe".to_string(),
        }],
        teams,
        players,
        leagues: vec![EditorLeague {
            id: "eng-premier".to_string(),
            name: "Premier League".to_string(),
            country_id: "ENG".to_string(),
            season_start_month: 8,
            season_start_day: 1,
            legs: 2,
            team_ids,
        }],
        updated_at: Some(now_string()),
    }
}

fn team(
    id: &str,
    name: &str,
    short_name: &str,
    city: &str,
    primary: &str,
    secondary: &str,
) -> TeamDef {
    TeamDef {
        id: id.to_string(),
        name: name.to_string(),
        short_name: short_name.to_string(),
        city: city.to_string(),
        country: "ENG".to_string(),
        colors: TeamColorsDef {
            primary: primary.to_string(),
            secondary: secondary.to_string(),
        },
        play_style: "Balanced".to_string(),
        stadium_name: format!("{city} Ground"),
        reputation_range: Some([450, 650]),
        finance_range: Some([1_500_000, 5_000_000]),
        stadium_capacity: Some(24_000),
        kit_pattern: Some(KitPattern::Solid),
        media: TeamMediaDef::default(),
    }
}

fn player_for_team(team: &TeamDef, index: usize) -> PlayerDef {
    let positions = [
        domain::player::Position::Goalkeeper,
        domain::player::Position::CenterBack,
        domain::player::Position::CentralMidfielder,
        domain::player::Position::RightWinger,
        domain::player::Position::Striker,
    ];
    let names = [
        ("Alex", "Morgan"),
        ("Daniel", "Reed"),
        ("Marcus", "Stone"),
        ("Leo", "Bennett"),
        ("Jamie", "Cole"),
    ];
    let (first_name, last_name) = names[index % names.len()];
    PlayerDef {
        id: format!("{}-{}", team.id, index + 1),
        name: format!("{first_name} {last_name}"),
        first_name: first_name.to_string(),
        last_name: last_name.to_string(),
        club: team.id.clone(),
        nationality: "ENG".to_string(),
        position: positions[index % positions.len()].clone(),
        date_of_birth: None,
        age: Some(22 + index as u32),
        overall: Some(62 + index as u8),
        attributes: None,
        media: PlayerMediaDef::default(),
    }
}

fn summary_from_project(project: &WorldEditorProject, dir: &Path) -> WorldEditorProjectSummary {
    WorldEditorProjectSummary {
        id: project.id.clone(),
        name: project.name.clone(),
        description: project.description.clone(),
        team_count: project.teams.len(),
        player_count: project.players.len(),
        updated_at: project.updated_at.clone().unwrap_or_else(now_string),
        path: dir.to_string_lossy().to_string(),
    }
}

fn add_issue(
    issues: &mut Vec<WorldEditorValidationIssue>,
    group: &str,
    entity_type: &str,
    entity_id: &str,
    entity_label: &str,
    severity: WorldEditorIssueSeverity,
    message: impl Into<String>,
) {
    let id = format!("{}-{}", group, issues.len() + 1);
    issues.push(WorldEditorValidationIssue {
        id,
        group: group.to_string(),
        entity_type: entity_type.to_string(),
        entity_id: entity_id.to_string(),
        entity_label: entity_label.to_string(),
        severity,
        message: message.into(),
    });
}

fn local_media_exists(project_dir: &Path, value: &str) -> bool {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.contains("://") || trimmed.starts_with("//") {
        return false;
    }
    let path = Path::new(trimmed);
    if path.is_absolute() {
        path.exists()
    } else {
        project_dir.join(path).exists()
    }
}

fn validation_for_project(
    project: &WorldEditorProject,
    project_dir: &Path,
) -> WorldEditorValidation {
    let mut issues = Vec::new();

    if project.name.trim().is_empty() {
        add_issue(
            &mut issues,
            "world",
            "world",
            &project.id,
            "World",
            WorldEditorIssueSeverity::Error,
            "Give this world a name.",
        );
    }
    if project.countries.is_empty() {
        add_issue(
            &mut issues,
            "world",
            "world",
            &project.id,
            "World",
            WorldEditorIssueSeverity::Error,
            "Add at least one country.",
        );
    }
    if project.teams.is_empty() {
        add_issue(
            &mut issues,
            "world",
            "world",
            &project.id,
            "World",
            WorldEditorIssueSeverity::Error,
            "Add at least two teams.",
        );
    }
    if project.leagues.is_empty() {
        add_issue(
            &mut issues,
            "world",
            "world",
            &project.id,
            "World",
            WorldEditorIssueSeverity::Error,
            "Create at least one league.",
        );
    }

    let country_ids: HashSet<&str> = project.countries.iter().map(|country| country.id.as_str()).collect();
    let mut team_ids = HashSet::new();
    let mut duplicate_team_ids = HashSet::new();
    for team in &project.teams {
        if !team_ids.insert(team.id.as_str()) {
            duplicate_team_ids.insert(team.id.as_str());
        }
    }

    for team in &project.teams {
        let label = if team.name.trim().is_empty() {
            team.id.as_str()
        } else {
            team.name.as_str()
        };
        if team.id.trim().is_empty() {
            add_issue(
                &mut issues,
                "teams",
                "team",
                &team.id,
                label,
                WorldEditorIssueSeverity::Error,
                "Team id is required.",
            );
        } else if duplicate_team_ids.contains(team.id.as_str()) {
            add_issue(
                &mut issues,
                "teams",
                "team",
                &team.id,
                label,
                WorldEditorIssueSeverity::Error,
                "Team id must be unique.",
            );
        }
        if team.name.trim().is_empty() {
            add_issue(
                &mut issues,
                "teams",
                "team",
                &team.id,
                label,
                WorldEditorIssueSeverity::Error,
                "Team name is required.",
            );
        }
        if team.city.trim().is_empty() {
            add_issue(
                &mut issues,
                "teams",
                "team",
                &team.id,
                label,
                WorldEditorIssueSeverity::Error,
                "Team city is required.",
            );
        }
        if !country_ids.contains(team.country.as_str()) {
            add_issue(
                &mut issues,
                "teams",
                "team",
                &team.id,
                label,
                WorldEditorIssueSeverity::Error,
                "Team country must exist in this world.",
            );
        }
        if team.media.logo.as_deref().unwrap_or("").trim().is_empty() {
            add_issue(
                &mut issues,
                "media",
                "team",
                &team.id,
                label,
                WorldEditorIssueSeverity::Warning,
                "Add a logo for a more polished team identity.",
            );
        } else if !local_media_exists(project_dir, team.media.logo.as_deref().unwrap_or_default()) {
            add_issue(
                &mut issues,
                "media",
                "team",
                &team.id,
                label,
                WorldEditorIssueSeverity::Warning,
                "Team logo file is missing.",
            );
        }
    }

    for league in &project.leagues {
        let label = if league.name.trim().is_empty() {
            league.id.as_str()
        } else {
            league.name.as_str()
        };
        if league.id.trim().is_empty() {
            add_issue(
                &mut issues,
                "leagues",
                "league",
                &league.id,
                label,
                WorldEditorIssueSeverity::Error,
                "League id is required.",
            );
        }
        if league.name.trim().is_empty() {
            add_issue(
                &mut issues,
                "leagues",
                "league",
                &league.id,
                label,
                WorldEditorIssueSeverity::Error,
                "League name is required.",
            );
        }
        if !country_ids.contains(league.country_id.as_str()) {
            add_issue(
                &mut issues,
                "leagues",
                "league",
                &league.id,
                label,
                WorldEditorIssueSeverity::Error,
                "League country must exist in this world.",
            );
        }
        if league.team_ids.len() < 2 {
            add_issue(
                &mut issues,
                "leagues",
                "league",
                &league.id,
                label,
                WorldEditorIssueSeverity::Error,
                "Add at least two teams to this league.",
            );
        }
        if league.team_ids.len() % 2 == 1 {
            add_issue(
                &mut issues,
                "leagues",
                "league",
                &league.id,
                label,
                WorldEditorIssueSeverity::Error,
                "Use an even number of teams so fixtures can be generated cleanly.",
            );
        }
        let mut seen = HashSet::new();
        for team_id in &league.team_ids {
            if !team_ids.contains(team_id.as_str()) {
                add_issue(
                    &mut issues,
                    "leagues",
                    "league",
                    &league.id,
                    label,
                    WorldEditorIssueSeverity::Error,
                    format!("Team `{team_id}` does not exist."),
                );
            } else if !seen.insert(team_id) {
                add_issue(
                    &mut issues,
                    "leagues",
                    "league",
                    &league.id,
                    label,
                    WorldEditorIssueSeverity::Error,
                    format!("Team `{team_id}` is listed more than once."),
                );
            }
        }
    }

    let mut player_ids = HashSet::new();
    let mut duplicate_player_ids = HashSet::new();
    for player in &project.players {
        if !player_ids.insert(player.id.as_str()) {
            duplicate_player_ids.insert(player.id.as_str());
        }
    }

    for player in &project.players {
        let label = if player.name.trim().is_empty() {
            player.id.as_str()
        } else {
            player.name.as_str()
        };
        if player.id.trim().is_empty() {
            add_issue(
                &mut issues,
                "players",
                "player",
                &player.id,
                label,
                WorldEditorIssueSeverity::Error,
                "Player id is required.",
            );
        } else if duplicate_player_ids.contains(player.id.as_str()) {
            add_issue(
                &mut issues,
                "players",
                "player",
                &player.id,
                label,
                WorldEditorIssueSeverity::Error,
                "Player id must be unique.",
            );
        }
        if player.name.trim().is_empty()
            && player.first_name.trim().is_empty()
            && player.last_name.trim().is_empty()
        {
            add_issue(
                &mut issues,
                "players",
                "player",
                &player.id,
                label,
                WorldEditorIssueSeverity::Error,
                "Player name is required.",
            );
        }
        if !team_ids.contains(player.club.as_str()) {
            add_issue(
                &mut issues,
                "players",
                "player",
                &player.id,
                label,
                WorldEditorIssueSeverity::Error,
                "Player club must exist in this world.",
            );
        }
        if !country_ids.contains(player.nationality.as_str()) {
            add_issue(
                &mut issues,
                "players",
                "player",
                &player.id,
                label,
                WorldEditorIssueSeverity::Error,
                "Player nationality must exist in this world.",
            );
        }
        if player.media.face.as_deref().unwrap_or("").trim().is_empty() {
            add_issue(
                &mut issues,
                "media",
                "player",
                &player.id,
                label,
                WorldEditorIssueSeverity::Warning,
                "Add a face photo for this player.",
            );
        } else if !local_media_exists(project_dir, player.media.face.as_deref().unwrap_or_default()) {
            add_issue(
                &mut issues,
                "media",
                "player",
                &player.id,
                label,
                WorldEditorIssueSeverity::Warning,
                "Player face file is missing.",
            );
        }
    }

    let blocking_issue_count = issues
        .iter()
        .filter(|issue| issue.severity == WorldEditorIssueSeverity::Error)
        .count();
    let warning_count = issues
        .iter()
        .filter(|issue| issue.severity == WorldEditorIssueSeverity::Warning)
        .count();

    let sections = vec![
        section("world", "World", 4, &issues),
        entity_section("leagues", "Leagues", &project.leagues, |league| &league.id, &issues),
        entity_section("teams", "Teams", &project.teams, |team| &team.id, &issues),
        entity_section("players", "Players", &project.players, |player| &player.id, &issues),
        media_section(project, &issues),
    ];

    WorldEditorValidation {
        sections,
        issues,
        blocking_issue_count,
        warning_count,
    }
}

fn section(
    id: &str,
    label: &str,
    total: usize,
    issues: &[WorldEditorValidationIssue],
) -> WorldEditorValidationSection {
    let errors = issues
        .iter()
        .filter(|issue| issue.group == id && issue.severity == WorldEditorIssueSeverity::Error)
        .count();
    let warnings = issues
        .iter()
        .filter(|issue| issue.group == id && issue.severity == WorldEditorIssueSeverity::Warning)
        .count();
    WorldEditorValidationSection {
        id: id.to_string(),
        label: label.to_string(),
        passed: total.saturating_sub(errors),
        total,
        errors,
        warnings,
    }
}

fn entity_section<T>(
    id: &str,
    label: &str,
    entities: &[T],
    entity_id: impl Fn(&T) -> &String,
    issues: &[WorldEditorValidationIssue],
) -> WorldEditorValidationSection {
    let total = entities.len().max(1);
    let errored: HashSet<&str> = issues
        .iter()
        .filter(|issue| issue.group == id && issue.severity == WorldEditorIssueSeverity::Error)
        .map(|issue| issue.entity_id.as_str())
        .collect();
    let warnings = issues
        .iter()
        .filter(|issue| issue.group == id && issue.severity == WorldEditorIssueSeverity::Warning)
        .count();
    let passed = if entities.is_empty() {
        0
    } else {
        entities
            .iter()
            .filter(|entity| !errored.contains(entity_id(entity).as_str()))
            .count()
    };
    WorldEditorValidationSection {
        id: id.to_string(),
        label: label.to_string(),
        passed,
        total,
        errors: errored.len(),
        warnings,
    }
}

fn media_section(
    project: &WorldEditorProject,
    issues: &[WorldEditorValidationIssue],
) -> WorldEditorValidationSection {
    let total = project.teams.len() + project.players.len();
    let warnings = issues
        .iter()
        .filter(|issue| issue.group == "media" && issue.severity == WorldEditorIssueSeverity::Warning)
        .count();
    WorldEditorValidationSection {
        id: "media".to_string(),
        label: "Media".to_string(),
        passed: total.saturating_sub(warnings),
        total,
        errors: 0,
        warnings,
    }
}

fn resolve_media_path(project_dir: &Path, value: &str) -> String {
    let path = Path::new(value);
    if path.is_absolute() {
        value.to_string()
    } else {
        project_dir.join(path).to_string_lossy().to_string()
    }
}

fn resolve_world_media_paths(world: &mut ofm_core::generator::WorldData, project_dir: &Path) {
    for team in &mut world.teams {
        if let Some(logo) = team.media.logo.clone() {
            if !logo.trim().is_empty() && !logo.contains("://") && !logo.starts_with("//") {
                team.media.logo = Some(resolve_media_path(project_dir, &logo));
            }
        }
    }
    for player in &mut world.players {
        if let Some(face) = player.media.face.clone() {
            if !face.trim().is_empty() && !face.contains("://") && !face.starts_with("//") {
                player.media.face = Some(resolve_media_path(project_dir, &face));
            }
        }
    }
}

#[tauri::command]
pub fn list_world_editor_projects(
    app_handle: tauri::AppHandle,
) -> Result<Vec<WorldEditorProjectSummary>, String> {
    let root = app_editor_root(&app_handle)?;
    std::fs::create_dir_all(&root).map_err(|_| READ_FAILED.to_string())?;
    let mut summaries = Vec::new();
    for entry in std::fs::read_dir(&root).map_err(|_| READ_FAILED.to_string())?.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let id = entry.file_name().to_string_lossy().to_string();
        if let Ok(project) = load_project_from_dir(id, &path) {
            summaries.push(summary_from_project(&project, &path));
        }
    }
    summaries.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(summaries)
}

#[tauri::command]
pub fn create_world_editor_project(
    app_handle: tauri::AppHandle,
    name: Option<String>,
    template: Option<String>,
) -> Result<WorldEditorProject, String> {
    let mut project = sample_project(name);
    if matches!(template.as_deref(), Some("blank")) {
        project.confederations.clear();
        project.countries.clear();
        project.teams.clear();
        project.players.clear();
        project.leagues.clear();
    }
    project.updated_at = Some(now_string());
    let dir = project_dir(&app_handle, &project.id)?;
    project.path = dir.to_string_lossy().to_string();
    write_project_to_dir(&project, &dir)?;
    Ok(project)
}

#[tauri::command]
pub fn open_world_editor_project(
    app_handle: tauri::AppHandle,
    project_id: String,
) -> Result<WorldEditorProject, String> {
    let dir = project_dir(&app_handle, &project_id)?;
    if !dir.exists() {
        return Err(PROJECT_NOT_FOUND.to_string());
    }
    load_project_from_dir(project_id, &dir)
}

#[tauri::command]
pub fn save_world_editor_project(
    app_handle: tauri::AppHandle,
    mut project: WorldEditorProject,
) -> Result<WorldEditorProject, String> {
    if project.id.trim().is_empty() {
        project.id = Uuid::new_v4().to_string();
    }
    project.updated_at = Some(now_string());
    let dir = project_dir(&app_handle, &project.id)?;
    project.path = dir.to_string_lossy().to_string();
    write_project_to_dir(&project, &dir)?;
    Ok(project)
}

#[tauri::command]
pub fn validate_world_editor_project(
    app_handle: tauri::AppHandle,
    project: WorldEditorProject,
) -> Result<WorldEditorValidation, String> {
    let dir = project_dir(&app_handle, &project.id)?;
    Ok(validation_for_project(&project, &dir))
}

#[tauri::command]
pub fn import_world_editor_asset(
    app_handle: tauri::AppHandle,
    project_id: String,
    entity_type: String,
    entity_id: String,
    source_path: String,
) -> Result<WorldEditorProject, String> {
    let dir = project_dir(&app_handle, &project_id)?;
    if !dir.exists() {
        return Err(PROJECT_NOT_FOUND.to_string());
    }
    let mut project = load_project_from_dir(project_id, &dir)?;
    let source = Path::new(&source_path);
    let extension = source
        .extension()
        .and_then(|ext| ext.to_str())
        .map(str::to_ascii_lowercase)
        .filter(|ext| matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "webp" | "svg"))
        .unwrap_or_else(|| "png".to_string());
    let filename = format!("{}.{}", sanitize_filename(&entity_id), extension);
    let (asset_dir, relative_path) = match entity_type.as_str() {
        "team" => (
            dir.join("assets").join("teams"),
            format!("assets/teams/{filename}"),
        ),
        "player" => (
            dir.join("assets").join("players"),
            format!("assets/players/{filename}"),
        ),
        _ => return Err(ASSET_COPY_FAILED.to_string()),
    };
    std::fs::create_dir_all(&asset_dir).map_err(|_| ASSET_COPY_FAILED.to_string())?;
    std::fs::copy(source, asset_dir.join(&filename)).map_err(|_| ASSET_COPY_FAILED.to_string())?;

    match entity_type.as_str() {
        "team" => {
            if let Some(team) = project.teams.iter_mut().find(|team| team.id == entity_id) {
                team.media.logo = Some(relative_path);
            }
        }
        "player" => {
            if let Some(player) = project.players.iter_mut().find(|player| player.id == entity_id) {
                player.media.face = Some(relative_path);
            }
        }
        _ => {}
    }

    project.updated_at = Some(now_string());
    write_project_to_dir(&project, &dir)?;
    project.path = dir.to_string_lossy().to_string();
    Ok(project)
}

#[tauri::command]
pub fn publish_world_editor_project(
    app_handle: tauri::AppHandle,
    project_id: String,
) -> Result<WorldDatabaseInfo, String> {
    let dir = project_dir(&app_handle, &project_id)?;
    if !dir.exists() {
        return Err(PROJECT_NOT_FOUND.to_string());
    }
    let project = load_project_from_dir(project_id, &dir)?;
    let validation = validation_for_project(&project, &dir);
    if validation.blocking_issue_count > 0 {
        return Err(VALIDATION_FAILED.to_string());
    }

    let (package, package_errors) = ofm_core::generator::load_world_package(&dir);
    if !package_errors.is_empty() {
        return Err(VALIDATION_FAILED.to_string());
    }
    let mut world = ofm_core::generator::build_world_from_package(&package)?;
    resolve_world_media_paths(&mut world, &dir);
    if world.metadata.world_id.trim().is_empty() {
        world.metadata.world_id = Uuid::new_v4().to_string();
    }
    world.metadata.format_version = 2;
    world.metadata.kind = WorldDataKind::RosterBaseline;

    let databases_dir = app_databases_root(&app_handle)?;
    std::fs::create_dir_all(&databases_dir).map_err(|_| WRITE_FAILED.to_string())?;
    let manifest_path = databases_dir.join(format!("{}.json", slug_for_project(&project)));
    let exported_path = ofm_core::generator::export_world_package(&world, &manifest_path)?;
    Ok(WorldDatabaseInfo {
        id: format!("file:{exported_path}"),
        name: world.name,
        description: world.description,
        team_count: world.teams.len(),
        player_count: world.players.len(),
        history_mode: "hybrid".to_string(),
        base_year: world.metadata.base_year,
        snapshot_date: world.metadata.snapshot_date,
        source: "user".to_string(),
        path: exported_path,
    })
}
