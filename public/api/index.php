<?php

declare(strict_types=1);

$configPath = __DIR__ . '/../../app/config.php';
if (!file_exists($configPath)) {
    $configPath = __DIR__ . '/../../app/config.example.php';
}

$config = require $configPath;
session_name($config['session_name'] ?? 'client_gantt_session');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

const STATUSES = ['planned', 'in_progress', 'waiting', 'done', 'paused'];
const PLANNING_MODES = ['total', 'daily'];

try {
    $pdo = db($config);
    $action = $_GET['action'] ?? 'timeline';
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    if ($action === 'login' && $method === 'POST') {
        login($config);
    }

    if ($action === 'logout' && $method === 'POST') {
        $_SESSION = [];
        session_destroy();
        json(['ok' => true]);
    }

    if ($action === 'me') {
        json(['authenticated' => isAuthenticated()]);
    }

    requireAuth();

    if ($action === 'timeline' && $method === 'GET') {
        timeline($pdo);
    }

    if ($action === 'diagnostics' && $method === 'GET') {
        diagnostics($pdo);
    }

    if ($action === 'export' && $method === 'GET') {
        exportData($pdo, $_GET['format'] ?? 'json');
    }

    if ($action === 'reorder' && $method === 'POST') {
        reorderItems($pdo);
    }

    if ($action === 'reorder_tasks' && $method === 'POST') {
        reorderItems($pdo, 'task');
    }

    routeCrud($pdo, $action, $method);
} catch (Throwable $e) {
    $status = (int) ($e->getCode() ?: 500);
    if ($status < 400 || $status > 599) {
        $status = 500;
    }
    json(['error' => $e->getMessage()], true, $status);
}

function db(array $config): PDO
{
    $db = $config['db'];
    $dsn = sprintf(
        'mysql:host=%s;dbname=%s;charset=%s',
        $db['host'],
        $db['database'],
        $db['charset'] ?? 'utf8mb4'
    );

    return new PDO($dsn, $db['username'], $db['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
}

function login(array $config): void
{
    $body = body();
    $username = trim((string) ($body['username'] ?? ''));
    $password = (string) ($body['password'] ?? '');
    $auth = $config['auth'];

    if ($username === $auth['username'] && passwordMatches($password, $auth)) {
        session_regenerate_id(true);
        $_SESSION['authenticated'] = true;
        json(['ok' => true]);
    }

    fail('Wrong login or password', 401);
}

function passwordMatches(string $password, array $auth): bool
{
    $hash = (string) ($auth['password_hash'] ?? '');
    if ($hash && !str_contains($hash, 'replace_this_hash') && password_verify($password, $hash)) {
        return true;
    }

    $plain = (string) ($auth['password_plain'] ?? '');
    return $plain !== '' && hash_equals($plain, $password);
}

function isAuthenticated(): bool
{
    return !empty($_SESSION['authenticated']);
}

function requireAuth(): void
{
    if (!isAuthenticated()) {
        fail('Authentication required', 401);
    }
}

function routeCrud(PDO $pdo, string $action, string $method): void
{
    $id = isset($_GET['id']) ? (int) $_GET['id'] : null;

    if ($action === 'clients') {
        crud($pdo, 'clients', $id, $method, ['name', 'contact', 'notes', 'sort_order'], ['name']);
    }

    if ($action === 'projects') {
        crud($pdo, 'projects', $id, $method, ['client_id', 'name', 'status', 'starts_on', 'ends_on', 'budget_hours', 'daily_capacity_hours', 'notes', 'sort_order'], ['client_id', 'name']);
    }

    if ($action === 'stages') {
        crud($pdo, 'stages', $id, $method, ['project_id', 'name', 'status', 'starts_on', 'ends_on', 'color', 'crm_url', 'description', 'sort_order'], ['project_id', 'name', 'starts_on', 'ends_on']);
    }

    if ($action === 'tasks') {
        crud($pdo, 'tasks', $id, $method, ['stage_id', 'name', 'status', 'starts_on', 'ends_on', 'planning_mode', 'hours_per_day', 'estimated_hours', 'crm_url', 'description', 'sort_order'], ['stage_id', 'name', 'starts_on', 'ends_on']);
    }

    fail('Unknown endpoint', 404);
}

function crud(PDO $pdo, string $table, ?int $id, string $method, array $fields, array $required): void
{
    if ($method === 'GET') {
        if ($id) {
            $stmt = $pdo->prepare("SELECT * FROM {$table} WHERE id = ?");
            $stmt->execute([$id]);
            $row = $stmt->fetch();
            if (!$row) {
                fail('Not found', 404);
            }
            json($row);
        }

        $stmt = $pdo->query("SELECT * FROM {$table} ORDER BY id DESC");
        json($stmt->fetchAll());
    }

    if ($method === 'POST') {
        $data = sanitize($table, body(), $fields, $required);
        if ($table === 'tasks') {
            $data = normalizeTaskPlanning($pdo, $data);
        }
        $data = assignSortOrderOnCreate($pdo, $table, $data);
        $columns = array_keys($data);
        $placeholders = array_fill(0, count($columns), '?');
        $sql = sprintf(
            'INSERT INTO %s (%s) VALUES (%s)',
            $table,
            implode(', ', $columns),
            implode(', ', $placeholders)
        );
        $stmt = $pdo->prepare($sql);
        $stmt->execute(array_values($data));
        json(['id' => (int) $pdo->lastInsertId()], true, 201);
    }

    if ($method === 'PUT' || $method === 'PATCH') {
        if (!$id) {
            fail('Missing id', 422);
        }
        $data = sanitize($table, body(), $fields, [], true);
        if (!$data) {
            fail('No fields to update', 422);
        }
        if ($table === 'tasks') {
            $data = normalizeTaskPlanning($pdo, $data, $id);
        }
        $assignments = array_map(fn ($field) => "{$field} = ?", array_keys($data));
        $values = array_values($data);
        $values[] = $id;
        $stmt = $pdo->prepare(sprintf('UPDATE %s SET %s WHERE id = ?', $table, implode(', ', $assignments)));
        $stmt->execute($values);
        json(['ok' => true]);
    }

    if ($method === 'DELETE') {
        if (!$id) {
            fail('Missing id', 422);
        }
        $stmt = $pdo->prepare("DELETE FROM {$table} WHERE id = ?");
        $stmt->execute([$id]);
        json(['ok' => true]);
    }

    fail('Method not allowed', 405);
}

function sanitize(string $table, array $input, array $fields, array $required, bool $partial = false): array
{
    $data = [];

    foreach ($fields as $field) {
        if (!array_key_exists($field, $input)) {
            continue;
        }

        $value = $input[$field];
        if (is_string($value)) {
            $value = trim($value);
        }
        if ($value === '') {
            $value = null;
        }

        if (in_array($field, ['client_id', 'project_id', 'stage_id', 'sort_order'], true)) {
            $value = $value === null ? null : (int) $value;
        }

        if (in_array($field, ['estimated_hours', 'hours_per_day', 'budget_hours', 'daily_capacity_hours'], true)) {
            $value = $value === null ? 0 : (float) $value;
            if ($value < 0 || $value > 9999) {
                fail('Hours must be between 0 and 9999', 422);
            }
        }

        if (in_array($field, ['budget_hours', 'daily_capacity_hours'], true) && $input[$field] === '') {
            $value = null;
        }

        if ($field === 'planning_mode') {
            $value = $value ?: 'total';
            if (!in_array($value, PLANNING_MODES, true)) {
                fail('Invalid planning mode', 422);
            }
        }

        if ($field === 'status') {
            $value = $value ?: 'planned';
            if (!in_array($value, STATUSES, true)) {
                fail('Invalid status', 422);
            }
        }

        if (in_array($field, ['starts_on', 'ends_on'], true) && $value !== null) {
            validateDate($value);
        }

        if ($field === 'crm_url' && $value !== null && !filter_var($value, FILTER_VALIDATE_URL)) {
            fail('Invalid CRM URL', 422);
        }

        if ($field === 'color' && $value !== null && !preg_match('/^#[0-9a-fA-F]{6}$/', $value)) {
            fail('Invalid color', 422);
        }

        $data[$field] = $value;
    }

    if (!$partial) {
        foreach ($required as $field) {
            if (!array_key_exists($field, $data) || $data[$field] === null) {
                fail("Missing field: {$field}", 422);
            }
        }
    }

    validateDateRange($data, $table, $partial);
    return $data;
}

function normalizeTaskPlanning(PDO $pdo, array $data, ?int $id = null): array
{
    $base = [];
    if ($id) {
        $stmt = $pdo->prepare('SELECT starts_on, ends_on, planning_mode, hours_per_day, estimated_hours FROM tasks WHERE id = ?');
        $stmt->execute([$id]);
        $base = $stmt->fetch() ?: [];
    }

    $merged = array_merge($base, $data);
    $start = $merged['starts_on'] ?? null;
    $end = $merged['ends_on'] ?? null;
    if (!$start || !$end) {
        return $data;
    }

    $duration = daysInclusive((string) $start, (string) $end);
    $mode = (string) ($merged['planning_mode'] ?? 'total');

    if ($mode === 'daily') {
        $hoursPerDay = round((float) ($merged['hours_per_day'] ?? 0), 2);
        $data['hours_per_day'] = $hoursPerDay;
        $data['estimated_hours'] = round($hoursPerDay * $duration, 2);
        return $data;
    }

    $estimatedHours = round((float) ($merged['estimated_hours'] ?? 0), 2);
    $data['estimated_hours'] = $estimatedHours;
    $data['hours_per_day'] = round($estimatedHours / max($duration, 1), 2);
    $data['planning_mode'] = 'total';
    return $data;
}

function assignSortOrderOnCreate(PDO $pdo, string $table, array $data): array
{
    $scopeMap = [
        'clients' => null,
        'projects' => 'client_id',
        'stages' => 'project_id',
        'tasks' => 'stage_id',
    ];
    $scopeField = $scopeMap[$table] ?? null;
    if (!array_key_exists($table, $scopeMap) || !empty($data['sort_order'])) {
        return $data;
    }

    if (!$scopeField) {
        $stmt = $pdo->query("SELECT COALESCE(MAX(sort_order), 0) FROM {$table}");
    } else {
        if (empty($data[$scopeField])) {
            return $data;
        }
        $stmt = $pdo->prepare("SELECT COALESCE(MAX(sort_order), 0) FROM {$table} WHERE {$scopeField} = ?");
        $stmt->execute([$data[$scopeField]]);
    }
    $data['sort_order'] = ((int) $stmt->fetchColumn()) + 10;
    return $data;
}

function daysInclusive(string $start, string $end): int
{
    $startDate = new DateTimeImmutable($start);
    $endDate = new DateTimeImmutable($end);
    return max((int) $startDate->diff($endDate)->days + 1, 1);
}

function validateDate(string $date): void
{
    $dt = DateTime::createFromFormat('Y-m-d', $date);
    if (!$dt || $dt->format('Y-m-d') !== $date) {
        fail('Invalid date format. Use YYYY-MM-DD.', 422);
    }
}

function validateDateRange(array $data, string $table, bool $partial): void
{
    if (!in_array($table, ['projects', 'stages', 'tasks'], true)) {
        return;
    }

    if (isset($data['starts_on'], $data['ends_on']) && $data['starts_on'] !== null && $data['ends_on'] !== null) {
        if ($data['ends_on'] < $data['starts_on']) {
            fail('End date cannot be earlier than start date', 422);
        }
    }

    if (!$partial && in_array($table, ['stages', 'tasks'], true)) {
        if (empty($data['starts_on']) || empty($data['ends_on'])) {
            fail('Start and end dates are required', 422);
        }
    }
}

function timeline(PDO $pdo): void
{
    json([
        'clients' => $pdo->query('SELECT * FROM clients ORDER BY sort_order, name, id')->fetchAll(),
        'projects' => $pdo->query('SELECT * FROM projects ORDER BY client_id, sort_order, starts_on IS NULL, starts_on, id')->fetchAll(),
        'stages' => $pdo->query('SELECT * FROM stages ORDER BY project_id, sort_order, starts_on, id')->fetchAll(),
        'tasks' => $pdo->query('SELECT * FROM tasks ORDER BY stage_id, sort_order, starts_on, id')->fetchAll(),
    ]);
}

function reorderItems(PDO $pdo, ?string $forcedType = null): void
{
    $payload = body();
    $type = $forcedType ?: (string) ($payload['type'] ?? '');
    $config = [
        'client' => ['table' => 'clients', 'scope' => null, 'scope_key' => null, 'ids_key' => 'client_ids'],
        'project' => ['table' => 'projects', 'scope' => 'client_id', 'scope_key' => 'client_id', 'ids_key' => 'project_ids'],
        'stage' => ['table' => 'stages', 'scope' => 'project_id', 'scope_key' => 'project_id', 'ids_key' => 'stage_ids'],
        'task' => ['table' => 'tasks', 'scope' => 'stage_id', 'scope_key' => 'stage_id', 'ids_key' => 'task_ids'],
    ][$type] ?? null;

    if (!$config) {
        fail('Invalid reorder type', 422);
    }

    $scopeId = $config['scope_key'] ? (int) ($payload[$config['scope_key']] ?? 0) : null;
    $itemIds = $payload['item_ids'] ?? $payload[$config['ids_key']] ?? [];

    if (($config['scope_key'] && $scopeId <= 0) || !is_array($itemIds) || count($itemIds) === 0) {
        fail('Missing reorder scope or item_ids', 422);
    }

    $itemIds = array_values(array_unique(array_map('intval', $itemIds)));
    if (in_array(0, $itemIds, true)) {
        fail('Invalid item id', 422);
    }

    $placeholders = implode(',', array_fill(0, count($itemIds), '?'));
    if ($config['scope']) {
        $stmt = $pdo->prepare("SELECT id FROM {$config['table']} WHERE {$config['scope']} = ? AND id IN ({$placeholders})");
        $stmt->execute(array_merge([$scopeId], $itemIds));
    } else {
        $stmt = $pdo->prepare("SELECT id FROM {$config['table']} WHERE id IN ({$placeholders})");
        $stmt->execute($itemIds);
    }
    $found = array_map('intval', array_column($stmt->fetchAll(), 'id'));
    sort($found);
    $expected = $itemIds;
    sort($expected);

    if ($found !== $expected) {
        fail('Items must belong to the same parent', 422);
    }

    $pdo->beginTransaction();
    try {
        $where = $config['scope'] ? "id = ? AND {$config['scope']} = ?" : 'id = ?';
        $update = $pdo->prepare("UPDATE {$config['table']} SET sort_order = ? WHERE {$where}");
        foreach ($itemIds as $index => $itemId) {
            $params = $config['scope'] ? [($index + 1) * 10, $itemId, $scopeId] : [($index + 1) * 10, $itemId];
            $update->execute($params);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    json(['ok' => true]);
}

function diagnostics(PDO $pdo): void
{
    $counts = [];
    foreach (['clients', 'projects', 'stages', 'tasks'] as $table) {
        $counts[$table] = (int) $pdo->query("SELECT COUNT(*) FROM {$table}")->fetchColumn();
    }

    $latestClients = $pdo
        ->query('SELECT id, name, created_at FROM clients ORDER BY id DESC LIMIT 5')
        ->fetchAll();

    json([
        'ok' => true,
        'time' => gmdate('c'),
        'counts' => $counts,
        'latest_clients' => $latestClients,
    ]);
}

function exportData(PDO $pdo, string $format): void
{
    $data = [
        'exported_at' => gmdate('c'),
        'clients' => $pdo->query('SELECT * FROM clients ORDER BY id')->fetchAll(),
        'projects' => $pdo->query('SELECT * FROM projects ORDER BY id')->fetchAll(),
        'stages' => $pdo->query('SELECT * FROM stages ORDER BY id')->fetchAll(),
        'tasks' => $pdo->query('SELECT * FROM tasks ORDER BY id')->fetchAll(),
    ];

    if ($format === 'csv') {
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="gantt-export.csv"');
        $out = fopen('php://output', 'w');
        foreach (['clients', 'projects', 'stages', 'tasks'] as $section) {
            fputcsv($out, [$section]);
            if ($data[$section]) {
                fputcsv($out, array_keys($data[$section][0]));
                foreach ($data[$section] as $row) {
                    fputcsv($out, $row);
                }
            }
            fputcsv($out, []);
        }
        exit;
    }

    header('Content-Disposition: attachment; filename="gantt-export.json"');
    json($data);
}

function body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $data = json_decode($raw, true);
    if (!is_array($data)) {
        fail('Invalid JSON body', 400);
    }
    return $data;
}

function json(mixed $payload, bool $exit = true, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($exit) {
        exit;
    }
}

function fail(string $message, int $status): void
{
    throw new RuntimeException($message, $status);
}
