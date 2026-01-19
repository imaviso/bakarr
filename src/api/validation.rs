use super::ApiError;

pub fn validate_anime_id(id: i32) -> Result<i32, ApiError> {
    if id <= 0 {
        return Err(ApiError::validation(format!(
            "Invalid anime ID: {}. ID must be a positive integer",
            id
        )));
    }
    Ok(id)
}

pub fn validate_episode_number(episode: i32) -> Result<i32, ApiError> {
    if episode <= 0 {
        return Err(ApiError::validation(format!(
            "Invalid episode number: {}. Episode must be a positive integer",
            episode
        )));
    }
    Ok(episode)
}

pub fn validate_limit(limit: usize) -> Result<usize, ApiError> {
    const MAX_LIMIT: usize = 1000;
    const MIN_LIMIT: usize = 1;

    if !(MIN_LIMIT..=MAX_LIMIT).contains(&limit) {
        return Err(ApiError::validation(format!(
            "Invalid limit: {}. Limit must be between {} and {}",
            limit, MIN_LIMIT, MAX_LIMIT
        )));
    }
    Ok(limit)
}

pub fn validate_profile_name(name: &str) -> Result<&str, ApiError> {
    if name.is_empty() {
        return Err(ApiError::validation("Profile name cannot be empty"));
    }

    if name.len() > 50 {
        return Err(ApiError::validation(
            "Profile name must be 50 characters or less",
        ));
    }

    if !name
        .chars()
        .all(|c| c.is_alphanumeric() || c == ' ' || c == '-' || c == '_')
    {
        return Err(ApiError::validation(
            "Profile name can only contain letters, numbers, spaces, hyphens, and underscores",
        ));
    }

    Ok(name)
}

pub fn validate_search_query(query: &str) -> Result<&str, ApiError> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Err(ApiError::validation("Search query cannot be empty"));
    }
    Ok(trimmed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_anime_id() {
        assert!(validate_anime_id(1).is_ok());
        assert!(validate_anime_id(12345).is_ok());
        assert!(validate_anime_id(0).is_err());
        assert!(validate_anime_id(-1).is_err());
    }

    #[test]
    fn test_validate_limit() {
        assert!(validate_limit(1).is_ok());
        assert!(validate_limit(500).is_ok());
        assert!(validate_limit(1000).is_ok());
        assert!(validate_limit(0).is_err());
        assert!(validate_limit(1001).is_err());
    }

    #[test]
    fn test_validate_profile_name() {
        assert!(validate_profile_name("Default").is_ok());
        assert!(validate_profile_name("My Profile").is_ok());
        assert!(validate_profile_name("High-Quality_1080p").is_ok());
        assert!(validate_profile_name("").is_err());
        assert!(validate_profile_name("a".repeat(51).as_str()).is_err());
        assert!(validate_profile_name("Invalid@Name").is_err());
    }

    #[test]
    fn test_validate_search_query() {
        assert!(validate_search_query("Steins Gate").is_ok());
        assert!(validate_search_query("  trimmed  ").is_ok());
        assert!(validate_search_query("").is_err());
        assert!(validate_search_query("   ").is_err());
    }
}
