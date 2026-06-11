# Client Gantt Installation Guide

This guide is for installing the planner on ordinary shared hosting.

## Quick Installer

1. Upload the archive contents to your subdomain directory.
2. Open:

   ```text
   https://gantt.example.com/install.php
   ```

3. The installer shows the detected absolute server path.
4. Enter:
   - database host, name, user, and password;
   - app login and password;
   - browser Basic Auth login and password.
5. Keep `Import database/schema.sql` checked for a new database.
6. Submit the form.
7. Delete `install.php` after successful installation.

The installer creates or updates:

```text
app/config.php
app/.htpasswd
app/installed.lock
.htaccess
public/.htaccess
```

## Manual Installation

Recommended server structure:

```text
gantt.example.com/
  .htaccess
  index.php
  app/
  database/
  public/
  tools/
```

If your hosting lets you set the web root, point it to:

```text
gantt.example.com/public
```

If not, upload the whole folder contents into the subdomain directory. The root `index.php` serves the app from `/`.

## Database

Create a MySQL/MariaDB database and import:

```text
database/schema.sql
```

For existing installations, apply migrations from:

```text
database/migrations/
```

Current migrations:

```sql
ALTER TABLE tasks
ADD COLUMN estimated_hours DECIMAL(6,2) NOT NULL DEFAULT 0 AFTER ends_on;

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

ALTER TABLE projects
ADD COLUMN sort_order INT NOT NULL DEFAULT 0 AFTER notes;

UPDATE projects
SET sort_order = id * 10
WHERE sort_order = 0;

ALTER TABLE clients
ADD COLUMN sort_order INT NOT NULL DEFAULT 0 AFTER notes;

UPDATE clients
SET sort_order = id * 10
WHERE sort_order = 0;
```

## Config

Copy:

```text
app/config.example.php
```

to:

```text
app/config.php
```

Then set:

```php
'app_url' => 'https://gantt.example.com/',
'db' => [
    'host' => 'localhost',
    'database' => 'database_name',
    'username' => 'database_user',
    'password' => 'database_password',
    'charset' => 'utf8mb4',
],
'auth' => [
    'username' => 'your-login',
    'password_hash' => 'generated-password-hash',
    'password_plain' => '',
],
```

Generate the app password hash:

```bash
php tools/hash-password.php "your-password"
```

## Browser Password Protection

Create:

```text
app/.htpasswd
```

Then edit `.htaccess` and `public/.htaccess` if you are doing this manually.

To find the absolute server path, temporarily create `path.php` in the subdomain root:

```php
<?php
echo '<pre>';
echo 'DOCUMENT_ROOT: ' . ($_SERVER['DOCUMENT_ROOT'] ?? 'none') . "\n";
echo '__DIR__: ' . __DIR__ . "\n";
echo 'SCRIPT_FILENAME: ' . ($_SERVER['SCRIPT_FILENAME'] ?? 'none') . "\n";
echo '</pre>';
```

Open:

```text
https://gantt.example.com/path.php
```

If it shows:

```text
DOCUMENT_ROOT: /var/www/account/data/www/gantt.example.com
```

then `AuthUserFile` is usually:

```text
/var/www/account/data/www/gantt.example.com/app/.htpasswd
```

Delete `path.php` after checking.

## Task Load And Overbooking

Only tasks count toward workload.

Each task has:

```text
estimated_hours
planning_mode
hours_per_day
starts_on
ends_on
status
```

Task planning modes:

- `total`: enter total hours; the app calculates hours/day from task duration.
- `daily`: enter hours/day; the app calculates total hours from task duration.

Done tasks are ignored in daily workload.

Projects can have:

```text
budget_hours
daily_capacity_hours
ends_on
```

If a project has no `ends_on`, it is treated as ongoing. Budget and max hours/day still work, but the app does not show a deadline-based `need Xh/day` target. Because support retainers are not magic; they just refuse to end.

Daily load colors:

- up to 10h: ok
- 10-14h: busy
- 14-18h: heavy
- above 18h: overbooked

## Timeline Interaction

- Use `Today's agenda` near the page title to see active tasks scheduled for today with client, project, task, and planned hours.
- Drag timeline bars to move dates.
- Drag bar edges to resize the date range.
- Hover a timeline bar to show the edit pencil.
- Drag client rows to reorder top-level groups.
- Drag project rows to reorder projects inside the same client.
- Drag stage rows to reorder stages inside the same project.
- Drag task rows to reorder tasks inside the same stage.
- Use chevrons on projects and stages to collapse or expand nested rows.
- Use `Save and Add More` when creating projects, stages, or tasks to keep adding items inside the same parent.

Dense timeline labels omit the `h` suffix to save horizontal space. Tooltips and the agenda still show readable hour units.

## Backups

Open the gear menu and use:

- `Backup CSV`
- `Backup JSON`

This is a manual export, not a full hosting backup. Да, скучно. Да, важно.
