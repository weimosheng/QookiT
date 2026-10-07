use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::error::AppResult;
use super::model::Group;

#[derive(Serialize, Deserialize)]
struct GroupsFile {
    version: u32,
    groups: Vec<Group>,
}

pub struct GroupStore {
    dir: PathBuf,
}

impl GroupStore {
    pub fn new(dir: PathBuf) -> AppResult<Self> {
        std::fs::create_dir_all(&dir)?;
        Ok(Self { dir })
    }

    fn file(&self) -> PathBuf {
        self.dir.join("groups.json")
    }

    pub fn load(&self) -> AppResult<Vec<Group>> {
        let path = self.file();
        if !path.exists() {
            return Ok(Vec::new());
        }
        let content = std::fs::read_to_string(&path)?;
        let file: GroupsFile = serde_json::from_str(&content)?;
        Ok(file.groups)
    }

    pub fn save(&self, groups: &[Group]) -> AppResult<()> {
        let file = GroupsFile {
            version: 1,
            groups: groups.to_vec(),
        };
        let json = serde_json::to_string_pretty(&file)?;
        let path = self.file();
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, json)?;
        crate::fsutil::safe_rename(&tmp, &path)?;
        Ok(())
    }
}
