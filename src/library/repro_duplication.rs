#[test]
fn test_series_title_with_year_duplication() {
    let service = LibraryService::new(test_config());
    let mut anime = test_anime("Fate strange Fake -Whispers of Dawn-", None);
    
    anime.path = Some("/library/Fate strange Fake -Whispers of Dawn- (2023)".to_string());

    let options = RenamingOptions {
        anime: anime.clone(),
        episode_number: 1,
        season: Some(1),
        episode_title: "Episode 1".to_string(),
        quality: None,
        group: None,
        original_filename: None,
        extension: "mkv".to_string(),
        year: Some(2023),
        media_info: None,
    };

    
    let mut config = test_config();
    config.naming_format = "{Series Title} ({Year})/Season {Season}/{Series Title} - S{Season:02}E{Episode:02} - {Title}".to_string();
    let service = LibraryService::new(config);

    let path = service.get_destination_path(&options);
    let path_str = path.to_str().unwrap();

    
    println!("Generated path: {}", path_str);

    
    assert!(!path_str.contains("(2023) (2023)"));
}
