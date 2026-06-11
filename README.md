# Client Gantt

Compact private Gantt planner for client projects.

## Stack

- PHP 8+
- MySQL or MariaDB
- Vanilla HTML/CSS/JS
- Apache `.htaccess`
- No Node build step on hosting

## Fast Setup

Example target URL:

```text
https://gantt.example.com/
```

1. Upload files to the subdomain directory.
2. Open:

   ```text
   https://gantt.example.com/install.php
   ```

3. Enter database credentials, app login, and browser password.
4. Keep `Import database/schema.sql` checked for a new database.
5. Delete `install.php` after installation.

For manual setup, see `INSTALL.md`.

## Features

- Single-user private login.
- Clients, projects, stages, and tasks.
- Compact day/week Gantt timeline.
- Drag bars to move dates.
- Drag left/right edges to resize dates.
- CRM URL fields for stages and tasks.
- Search and filters.
- Gear menu for CSV/JSON backups and debug tools.
- Task `estimated_hours`.
- Daily load strip based only on active tasks.
- Overbooking highlight above 18h/day.
- Done mark inside timeline bars.

## Important Files

- `install.php` - browser installer. Delete after setup.
- `public/` - frontend files and API entrypoint.
- `public/api/index.php` - JSON API.
- `app/config.example.php` - config template.
- `database/schema.sql` - database schema and demo data.
- `database/migrations/` - updates for existing installations.
- `tools/hash-password.php` - helper for manual password hashes.

## Do Not Share Configured Secrets

Do not share a configured installation with:

```text
app/config.php
app/.htpasswd
app/installed.lock
install.php after installation
```

That is where the boring-but-dangerous stuff lives.
