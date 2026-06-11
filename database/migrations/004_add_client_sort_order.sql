ALTER TABLE clients
ADD COLUMN sort_order INT NOT NULL DEFAULT 0 AFTER notes;

UPDATE clients
SET sort_order = id * 10
WHERE sort_order = 0;
