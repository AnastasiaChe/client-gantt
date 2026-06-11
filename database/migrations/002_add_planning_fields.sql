ALTER TABLE projects
ADD COLUMN budget_hours DECIMAL(7,2) NULL AFTER ends_on,
ADD COLUMN daily_capacity_hours DECIMAL(6,2) NULL AFTER budget_hours;

ALTER TABLE tasks
ADD COLUMN planning_mode ENUM('total', 'daily') NOT NULL DEFAULT 'total' AFTER ends_on,
ADD COLUMN hours_per_day DECIMAL(6,2) NOT NULL DEFAULT 0 AFTER planning_mode;

UPDATE tasks
SET hours_per_day = ROUND(
    estimated_hours / GREATEST(DATEDIFF(ends_on, starts_on) + 1, 1),
    2
)
WHERE starts_on IS NOT NULL
  AND ends_on IS NOT NULL;
