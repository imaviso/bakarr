use regex::Regex;
use std::sync::OnceLock;

#[must_use]
pub fn parse_size(size_str: &str) -> Option<i64> {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE
        .get_or_init(|| Regex::new(r"(?i)^(\d+(?:\.\d+)?)\s*([KMGT]i?B)$").expect("Invalid regex"));

    let caps = re.captures(size_str.trim())?;
    let value: f64 = caps.get(1)?.as_str().parse().ok()?;
    let unit = caps.get(2)?.as_str().to_uppercase();

    let bytes = match unit.as_str() {
        "KIB" => value * 1024.0,
        "MIB" => value * 1024.0 * 1024.0,
        "GIB" => value * 1024.0 * 1024.0 * 1024.0,
        "TIB" => value * 1024.0 * 1024.0 * 1024.0 * 1024.0,
        "KB" => value * 1000.0,
        "MB" => value * 1000.0 * 1000.0,
        "GB" => value * 1000.0 * 1000.0 * 1000.0,
        "TB" => value * 1000.0 * 1000.0 * 1000.0 * 1000.0,
        _ => return None,
    };

    #[allow(clippy::cast_possible_truncation)]
    Some(bytes as i64)
}

#[must_use]
pub fn format_size(bytes: i64) -> String {
    const KB: i64 = 1024;
    const MB: i64 = KB * 1024;
    const GB: i64 = MB * 1024;
    const TB: i64 = GB * 1024;

    #[allow(clippy::cast_precision_loss)]
    if bytes >= TB {
        format!("{:.2} TiB", bytes as f64 / TB as f64)
    } else if bytes >= GB {
        format!("{:.2} GiB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.2} MiB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.2} KiB", bytes as f64 / KB as f64)
    } else {
        format!("{bytes} B")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_size() {
        assert_eq!(parse_size("1.5 GiB"), Some(1_610_612_736));
        assert_eq!(parse_size("500 MiB"), Some(524_288_000));
        assert_eq!(parse_size("100 KiB"), Some(102_400));
        assert_eq!(parse_size("1.2 GB"), Some(1_200_000_000));
        assert_eq!(parse_size("invalid"), None);
    }

    #[test]
    fn test_format_size() {
        assert_eq!(format_size(500), "500 B");
        assert_eq!(format_size(1024), "1.00 KiB");
        assert_eq!(format_size(1_610_612_736), "1.50 GiB");
    }
}
