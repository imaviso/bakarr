-- Reject future anime rows whose root folders overlap an existing mapping.
-- Using triggers keeps upgrades safe for databases that already contain conflicts.
CREATE TRIGGER IF NOT EXISTS anime_root_folder_no_overlap_insert
BEFORE INSERT ON anime
FOR EACH ROW
WHEN EXISTS (
  SELECT 1
  FROM anime
  WHERE
    rtrim(root_folder, '/') = rtrim(NEW.root_folder, '/')
    OR instr(rtrim(NEW.root_folder, '/') || '/', rtrim(root_folder, '/') || '/') = 1
    OR instr(rtrim(root_folder, '/') || '/', rtrim(NEW.root_folder, '/') || '/') = 1
)
BEGIN
  SELECT RAISE(ABORT, 'anime root_folder overlaps existing anime');
END;

CREATE TRIGGER IF NOT EXISTS anime_root_folder_no_overlap_update
BEFORE UPDATE OF root_folder ON anime
FOR EACH ROW
WHEN EXISTS (
  SELECT 1
  FROM anime
  WHERE
    id != NEW.id
    AND (
      rtrim(root_folder, '/') = rtrim(NEW.root_folder, '/')
      OR instr(rtrim(NEW.root_folder, '/') || '/', rtrim(root_folder, '/') || '/') = 1
      OR instr(rtrim(root_folder, '/') || '/', rtrim(NEW.root_folder, '/') || '/') = 1
    )
)
BEGIN
  SELECT RAISE(ABORT, 'anime root_folder overlaps existing anime');
END;
