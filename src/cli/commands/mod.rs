mod add;
mod episodes;
mod history;
mod import;
mod info;
mod list;
mod profile;
mod remove;
mod rss;
mod scan;
mod search;
mod search_missing;
mod wanted;

pub use add::cmd_add_anime;
pub use episodes::cmd_episodes;
pub use history::cmd_history;
pub use import::cmd_import;
pub use info::cmd_anime_info;
pub use list::cmd_list_anime;
pub use profile::{
    cmd_profile_create, cmd_profile_delete, cmd_profile_edit, cmd_profile_list, cmd_profile_show,
};
pub use remove::cmd_remove_anime;
pub use rss::{cmd_rss_add, cmd_rss_check, cmd_rss_list, cmd_rss_remove};
pub use scan::cmd_scan_library;
pub use search::cmd_search_anime;
pub use search_missing::cmd_search_missing;
pub use wanted::cmd_wanted;
