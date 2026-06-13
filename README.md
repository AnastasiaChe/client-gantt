# Client Gantt

Compact private Gantt planner for client projects.

## License And Use

This project is source-available for personal and internal use only.

You may use and modify it for your own planning or internal work. You may not sell, resell, rent, sublicense, commercially redistribute, or offer it as a paid hosted service/SaaS.

See `LICENSE.md` for the full terms.

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
- Drag clients, projects, stages, and tasks in the left list to reorder them.
- Collapse and expand projects and stages.
- Hover timeline bars to reveal an edit pencil.
- Save and Add More for adding project/stage/task batches.
- CRM URL fields for stages and tasks.
- Search and filters.
- Today's agenda modal with active tasks and planned hours for the day.
- Gear menu for CSV/JSON backups and debug tools.
- Task `estimated_hours`.
- Task planning modes: fixed total hours or automatic total from hours/day.
- Project budget hours and max hours/day.
- Ongoing projects without a deadline.
- Daily load strip based only on active tasks.
- Compact hour labels in the dense timeline.
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
