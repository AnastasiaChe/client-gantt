ALTER TABLE projects
ADD COLUMN hourly_rate DECIMAL(10,2) NULL AFTER budget_hours;
