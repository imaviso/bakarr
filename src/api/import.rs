use axum::{Json, extract::Query, extract::State};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use super::{ApiError, ApiResponse, AppState};
use crate::domain::AnimeId;
use crate::services::import_service::ImportFileRequestDto;

#[derive(Debug, Deserialize)]
pub struct BrowseRequest {
    #[serde(default)]
    pub path: String,
}

#[derive(Debug, Serialize)]
pub struct BrowseResult {
    pub current_path: String,
    pub parent_path: Option<String>,
    pub entries: Vec<BrowseEntry>,
}

#[derive(Debug, Serialize)]
pub struct BrowseEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub size: Option<u64>,
}

#[derive(Debug, Deserialize)]
pub struct ScanRequest {
    pub path: String,
    pub anime_id: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct ImportRequest {
    pub files: Vec<ImportFileRequest>,
}

#[derive(Debug, Deserialize)]
pub struct ImportFileRequest {
    pub source_path: String,
    pub anime_id: i32,
    pub episode_number: i32,
    pub season: Option<i32>,
}

pub async fn scan_path(
    State(state): State<Arc<AppState>>,
    Json(request): Json<ScanRequest>,
) -> Result<Json<ApiResponse<crate::services::import_service::ScanResultDto>>, ApiError> {
    let target_anime_id = request.anime_id.map(AnimeId::new);

    let result = state
        .import_service()
        .scan_path(request.path, target_anime_id)
        .await
        .map_err(|e| match e {
            crate::services::import_service::ImportError::PathNotFound(p) => {
                ApiError::validation(format!("Path does not exist: {p}"))
            }
            _ => ApiError::internal(e.to_string()),
        })?;

    Ok(Json(ApiResponse::success(result)))
}

pub async fn import_files(
    State(state): State<Arc<AppState>>,
    Json(request): Json<ImportRequest>,
) -> Result<Json<ApiResponse<crate::services::import_service::ImportOperationResult>>, ApiError> {
    let requests = request
        .files
        .into_iter()
        .map(|f| ImportFileRequestDto {
            source_path: f.source_path,
            anime_id: f.anime_id,
            episode_number: f.episode_number,
            season: f.season,
        })
        .collect();

    let result = state.import_service().import_files(requests).await;

    Ok(Json(ApiResponse::success(result)))
}

pub async fn browse_path(
    Query(request): Query<BrowseRequest>,
) -> Result<Json<ApiResponse<BrowseResult>>, ApiError> {
    // This logic is simple enough to stay here for now, or we could move it to a SystemService/Utility
    let path_str = request.path.trim();

    if path_str.is_empty() || path_str == "/" {
        return Ok(Json(ApiResponse::success(browse_root())));
    }

    let browse_path = std::path::Path::new(path_str);
    if !browse_path.exists() || !browse_path.is_dir() {
        return Err(ApiError::validation(format!(
            "Path does not exist or is not a directory: {path_str}"
        )));
    }

    let mut entries = Vec::new();
    let video_extensions = crate::constants::VIDEO_EXTENSIONS;

    let mut dir_entries = tokio::fs::read_dir(browse_path)
        .await
        .map_err(|e| ApiError::validation(format!("Cannot read directory: {e}")))?;

    let mut all_entries = Vec::new();
    while let Ok(Some(entry)) = dir_entries.next_entry().await {
        all_entries.push(entry);
    }

    all_entries.sort_by(|a, b| match (a.path().is_dir(), b.path().is_dir()) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.file_name().cmp(&b.file_name()),
    });

    for entry in all_entries {
        let entry_path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        if name.starts_with('.') {
            continue;
        }

        let is_directory = entry_path.is_dir();
        if !is_directory {
            let extension = entry_path
                .extension()
                .and_then(|e| e.to_str())
                .map(str::to_lowercase)
                .unwrap_or_default();

            if !video_extensions.contains(&extension.as_str()) {
                continue;
            }
        }

        entries.push(BrowseEntry {
            name,
            path: entry_path.to_string_lossy().to_string(),
            is_directory,
            size: if is_directory {
                None
            } else {
                entry.metadata().await.ok().map(|m| m.len())
            },
        });
    }

    let parent_path = browse_path.parent().map(|p| {
        let p_str = p.to_string_lossy().to_string();
        if p_str.is_empty() {
            "/".to_string()
        } else {
            p_str
        }
    });

    Ok(Json(ApiResponse::success(BrowseResult {
        current_path: path_str.to_string(),
        parent_path,
        entries,
    })))
}

fn browse_root() -> BrowseResult {
    let mut entries = Vec::new();
    let root_paths = ["/home", "/mnt", "/media", "/data", "/srv", "/tmp"];

    for root in root_paths {
        if std::path::Path::new(root).exists() {
            entries.push(BrowseEntry {
                name: root.to_string(),
                path: root.to_string(),
                is_directory: true,
                size: None,
            });
        }
    }

    if let Ok(home) = std::env::var("HOME")
        && !entries.iter().any(|e| e.path == home)
    {
        entries.insert(
            0,
            BrowseEntry {
                name: format!("~ ({home})"),
                path: home,
                is_directory: true,
                size: None,
            },
        );
    }

    BrowseResult {
        current_path: "/".to_string(),
        parent_path: None,
        entries,
    }
}
