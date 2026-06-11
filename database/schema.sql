CREATE TABLE clients (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(190) NOT NULL,
    contact VARCHAR(255) NULL,
    notes TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE projects (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    client_id INT UNSIGNED NOT NULL,
    name VARCHAR(190) NOT NULL,
    status ENUM('planned', 'in_progress', 'waiting', 'done', 'paused') NOT NULL DEFAULT 'planned',
    starts_on DATE NULL,
    ends_on DATE NULL,
    budget_hours DECIMAL(7,2) NULL,
    daily_capacity_hours DECIMAL(6,2) NULL,
    notes TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_projects_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    INDEX idx_projects_client (client_id),
    INDEX idx_projects_dates (starts_on, ends_on),
    INDEX idx_projects_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE stages (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    project_id INT UNSIGNED NOT NULL,
    name VARCHAR(190) NOT NULL,
    status ENUM('planned', 'in_progress', 'waiting', 'done', 'paused') NOT NULL DEFAULT 'planned',
    starts_on DATE NOT NULL,
    ends_on DATE NOT NULL,
    color VARCHAR(20) NOT NULL DEFAULT '#2563eb',
    crm_url VARCHAR(500) NULL,
    description TEXT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_stages_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    INDEX idx_stages_project (project_id),
    INDEX idx_stages_dates (starts_on, ends_on),
    INDEX idx_stages_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tasks (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    stage_id INT UNSIGNED NOT NULL,
    name VARCHAR(190) NOT NULL,
    status ENUM('planned', 'in_progress', 'waiting', 'done', 'paused') NOT NULL DEFAULT 'planned',
    starts_on DATE NOT NULL,
    ends_on DATE NOT NULL,
    planning_mode ENUM('total', 'daily') NOT NULL DEFAULT 'total',
    hours_per_day DECIMAL(6,2) NOT NULL DEFAULT 0,
    estimated_hours DECIMAL(6,2) NOT NULL DEFAULT 0,
    crm_url VARCHAR(500) NULL,
    description TEXT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_tasks_stage FOREIGN KEY (stage_id) REFERENCES stages(id) ON DELETE CASCADE,
    INDEX idx_tasks_stage (stage_id),
    INDEX idx_tasks_dates (starts_on, ends_on),
    INDEX idx_tasks_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO clients (name, contact, notes) VALUES
('Demo Client', 'owner@example.com', 'Remove this client after setup.');

INSERT INTO projects (client_id, name, status, starts_on, ends_on, budget_hours, daily_capacity_hours, notes) VALUES
(1, 'Website redesign', 'in_progress', CURRENT_DATE, DATE_ADD(CURRENT_DATE, INTERVAL 28 DAY), 60, 4, 'Demo project.');

INSERT INTO stages (project_id, name, status, starts_on, ends_on, color, description, sort_order) VALUES
(1, 'Audit and structure', 'in_progress', CURRENT_DATE, DATE_ADD(CURRENT_DATE, INTERVAL 7 DAY), '#2563eb', 'UX audit, offer, page structure.', 10),
(1, 'Design and copy', 'planned', DATE_ADD(CURRENT_DATE, INTERVAL 8 DAY), DATE_ADD(CURRENT_DATE, INTERVAL 18 DAY), '#7c3aed', 'Core screens and text.', 20);

INSERT INTO tasks (stage_id, name, status, starts_on, ends_on, planning_mode, hours_per_day, estimated_hours, crm_url, description, sort_order) VALUES
(1, 'Collect source materials', 'done', CURRENT_DATE, DATE_ADD(CURRENT_DATE, INTERVAL 2 DAY), 'total', 1.33, 4, NULL, 'Brief, analytics, competitors.', 10),
(1, 'Map conversion leaks', 'in_progress', DATE_ADD(CURRENT_DATE, INTERVAL 2 DAY), DATE_ADD(CURRENT_DATE, INTERVAL 7 DAY), 'daily', 2, 12, NULL, 'Find what blocks leads.', 20),
(2, 'Homepage draft', 'planned', DATE_ADD(CURRENT_DATE, INTERVAL 8 DAY), DATE_ADD(CURRENT_DATE, INTERVAL 13 DAY), 'total', 3, 18, NULL, 'First compact draft.', 10);
