use serde::Serialize;
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::groups::Group;
use crate::hosts::Host;
use crate::state::AppState;

#[derive(Serialize)]
pub struct GroupMutationResult {
    pub groups: Vec<Group>,
    pub hosts: Vec<Host>,
}

#[tauri::command]
pub async fn list_groups(state: State<'_, AppState>) -> AppResult<Vec<Group>> {
    state.groups_store.load()
}

#[tauri::command]
pub async fn add_group(state: State<'_, AppState>, group: Group) -> AppResult<Vec<Group>> {
    let mut groups = state.groups_store.load()?;
    groups.push(group);
    state.groups_store.save(&groups)?;
    Ok(groups)
}

#[tauri::command]
pub async fn update_group(
    state: State<'_, AppState>,
    group: Group,
) -> AppResult<GroupMutationResult> {
    let mut groups = state.groups_store.load()?;
    let now = chrono::Utc::now();
    let new_name = group.name.clone();
    let mut old_name: Option<String> = None;
    if let Some(g) = groups.iter_mut().find(|g| g.id == group.id) {
        if g.name != group.name {
            old_name = Some(g.name.clone());
        }
        let mut new_group = group;
        new_group.updated_at = now;
        *g = new_group;
    } else {
        return Err(AppError::GroupNotFound(group.id));
    }
    state.groups_store.save(&groups)?;

    let hosts = if let Some(old) = old_name {
        let mut hosts = state.store.load()?;
        let now = chrono::Utc::now();
        for h in hosts.iter_mut() {
            if h.group.as_deref() == Some(old.as_str()) {
                h.group = Some(new_name.clone());
                h.updated_at = now;
            }
        }
        state.store.save(&hosts)?;
        hosts
    } else {
        state.store.load()?
    };

    Ok(GroupMutationResult { groups, hosts })
}

#[tauri::command]
pub async fn delete_group(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<GroupMutationResult> {
    let mut groups = state.groups_store.load()?;
    let removed = groups.iter().find(|g| g.id == id).cloned();
    groups.retain(|g| g.id != id);
    state.groups_store.save(&groups)?;

    let hosts = if let Some(removed_group) = removed {
        let mut hosts = state.store.load()?;
        let now = chrono::Utc::now();
        let mut changed = false;
        for h in hosts.iter_mut() {
            if h.group.as_deref() == Some(removed_group.name.as_str()) {
                h.group = None;
                h.updated_at = now;
                changed = true;
            }
        }
        if changed {
            state.store.save(&hosts)?;
        }
        hosts
    } else {
        state.store.load()?
    };

    Ok(GroupMutationResult { groups, hosts })
}
