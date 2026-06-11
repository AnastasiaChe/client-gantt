ALTER TABLE projects
ADD COLUMN sort_order INT NOT NULL DEFAULT 0 AFTER notes;

UPDATE projects
SET sort_order = id * 10
WHERE sort_order = 0;
