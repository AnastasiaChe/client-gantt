<?php

declare(strict_types=1);

$root = __DIR__;
$appDir = $root . '/app';
$publicDir = $root . '/public';
$schemaPath = $root . '/database/schema.sql';
$configPath = $appDir . '/config.php';
$htpasswdPath = $appDir . '/.htpasswd';
$lockPath = $appDir . '/installed.lock';
$rootHtaccess = $root . '/.htaccess';
$publicHtaccess = $publicDir . '/.htaccess';
$errors = [];
$success = false;

if (file_exists($lockPath)) {
    renderInstalled($root, $htpasswdPath);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = [
        'app_url' => trim((string) ($_POST['app_url'] ?? '')),
        'db_host' => trim((string) ($_POST['db_host'] ?? 'localhost')),
        'db_name' => trim((string) ($_POST['db_name'] ?? '')),
        'db_user' => trim((string) ($_POST['db_user'] ?? '')),
        'db_pass' => (string) ($_POST['db_pass'] ?? ''),
        'app_user' => trim((string) ($_POST['app_user'] ?? '')),
        'app_pass' => (string) ($_POST['app_pass'] ?? ''),
        'basic_user' => trim((string) ($_POST['basic_user'] ?? '')),
        'basic_pass' => (string) ($_POST['basic_pass'] ?? ''),
        'import_schema' => !empty($_POST['import_schema']),
    ];

    foreach (['app_url', 'db_name', 'db_user', 'app_user', 'app_pass', 'basic_user', 'basic_pass'] as $field) {
        if ($input[$field] === '') {
            $errors[] = "{$field} is required.";
        }
    }

    if ($input['app_url'] && !filter_var($input['app_url'], FILTER_VALIDATE_URL)) {
        $errors[] = 'app_url must be a valid URL.';
    }

    if (!$errors) {
        try {
            $pdo = new PDO(
                sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', $input['db_host'], $input['db_name']),
                $input['db_user'],
                $input['db_pass'],
                [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false,
                ]
            );

            if ($input['import_schema']) {
                importSchema($pdo, $schemaPath);
            }

            writeConfig($configPath, $input);
            writeHtpasswd($htpasswdPath, $input['basic_user'], $input['basic_pass']);
            enableBasicAuth($rootHtaccess, $htpasswdPath);
            enableBasicAuth($publicHtaccess, $htpasswdPath);
            file_put_contents($lockPath, 'Installed at ' . gmdate('c') . PHP_EOL);
            $success = true;
        } catch (Throwable $e) {
            $errors[] = $e->getMessage();
        }
    }
}

renderForm($errors, $success, $root, $htpasswdPath);

function importSchema(PDO $pdo, string $schemaPath): void
{
    $sql = file_get_contents($schemaPath);
    if ($sql === false) {
        throw new RuntimeException('Cannot read database/schema.sql');
    }

    $statements = array_filter(array_map('trim', explode(';', $sql)));
    foreach ($statements as $statement) {
        if ($statement !== '') {
            $pdo->exec($statement);
        }
    }
}

function writeConfig(string $configPath, array $input): void
{
    $config = [
        'app_name' => 'Client Gantt',
        'app_url' => rtrim($input['app_url'], '/') . '/',
        'session_name' => 'client_gantt_session',
        'db' => [
            'host' => $input['db_host'],
            'database' => $input['db_name'],
            'username' => $input['db_user'],
            'password' => $input['db_pass'],
            'charset' => 'utf8mb4',
        ],
        'auth' => [
            'username' => $input['app_user'],
            'password_hash' => password_hash($input['app_pass'], PASSWORD_DEFAULT),
            'password_plain' => '',
        ],
    ];

    $content = "<?php\n\nreturn " . var_export($config, true) . ";\n";
    if (file_put_contents($configPath, $content) === false) {
        throw new RuntimeException('Cannot write app/config.php. Check file permissions.');
    }
}

function writeHtpasswd(string $path, string $username, string $password): void
{
    $safeUser = preg_replace('/[^A-Za-z0-9._-]/', '', $username);
    if ($safeUser === '') {
        throw new RuntimeException('Basic Auth username contains no usable characters.');
    }

    $hash = '{SHA}' . base64_encode(sha1($password, true));
    if (file_put_contents($path, $safeUser . ':' . $hash . PHP_EOL) === false) {
        throw new RuntimeException('Cannot write app/.htpasswd. Check file permissions.');
    }
}

function enableBasicAuth(string $htaccessPath, string $htpasswdPath): void
{
    $content = file_exists($htaccessPath) ? (string) file_get_contents($htaccessPath) : '';
    $content = preg_replace('/# BEGIN CLIENT_GANTT_AUTH.*?# END CLIENT_GANTT_AUTH\s*/s', '', $content) ?? $content;
    $block = implode(PHP_EOL, [
        '# BEGIN CLIENT_GANTT_AUTH',
        'AuthType Basic',
        'AuthName "Private Client Gantt"',
        'AuthUserFile "' . $htpasswdPath . '"',
        'Require valid-user',
        '# END CLIENT_GANTT_AUTH',
        '',
    ]);

    if (file_put_contents($htaccessPath, $block . ltrim($content)) === false) {
        throw new RuntimeException('Cannot update ' . basename($htaccessPath) . '. Check file permissions.');
    }
}

function renderInstalled(string $root, string $htpasswdPath): void
{
    pageHeader();
    echo '<main class="card">';
    echo '<h1>Client Gantt is already installed</h1>';
    echo '<p>The installer is locked. Delete <code>install.php</code> from the server now.</p>';
    echo '<dl><dt>Document root</dt><dd><code>' . e($root) . '</code></dd>';
    echo '<dt>Expected .htpasswd</dt><dd><code>' . e($htpasswdPath) . '</code></dd></dl>';
    echo '</main></body></html>';
}

function renderForm(array $errors, bool $success, string $root, string $htpasswdPath): void
{
    $currentUrl = currentUrl();
    pageHeader();
    echo '<main class="card">';
    echo '<h1>Client Gantt installer</h1>';
    echo '<p class="muted">This installer writes <code>app/config.php</code>, <code>app/.htpasswd</code>, updates <code>.htaccess</code>, and can import the database schema.</p>';
    echo '<dl><dt>Document root</dt><dd><code>' . e($root) . '</code></dd>';
    echo '<dt>Suggested AuthUserFile</dt><dd><code>' . e($htpasswdPath) . '</code></dd></dl>';

    if ($success) {
        echo '<section class="success"><strong>Installed.</strong> Delete <code>install.php</code> from the server, then open the app.</section>';
    }

    foreach ($errors as $error) {
        echo '<section class="error">' . e($error) . '</section>';
    }

    echo '<form method="post">';
    field('App URL', 'app_url', $currentUrl, 'url');
    field('DB host', 'db_host', 'localhost');
    field('DB name', 'db_name');
    field('DB user', 'db_user');
    field('DB password', 'db_pass', '', 'password');
    echo '<label class="check"><input type="checkbox" name="import_schema" value="1" checked> Import database/schema.sql</label>';
    field('App login', 'app_user', 'admin');
    field('App password', 'app_pass', '', 'password');
    field('Browser Basic Auth login', 'basic_user', 'admin');
    field('Browser Basic Auth password', 'basic_pass', '', 'password');
    echo '<button type="submit">Install</button>';
    echo '</form>';
    echo '</main></body></html>';
}

function field(string $label, string $name, string $value = '', string $type = 'text'): void
{
    echo '<label>' . e($label) . '<input type="' . e($type) . '" name="' . e($name) . '" value="' . e($value) . '" required></label>';
}

function currentUrl(): string
{
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'gantt.example.com';
    return $https . '://' . $host . '/';
}

function pageHeader(): void
{
    echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Client Gantt Installer</title><style>
    body{margin:0;background:#f6f7f9;color:#18202f;font:14px/1.45 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .card{width:min(760px,calc(100% - 32px));margin:32px auto;padding:22px;background:#fff;border:1px solid #d9dee7;border-radius:8px;box-shadow:0 18px 45px rgba(24,32,47,.08)}
    h1{margin:0 0 8px;font-size:24px} .muted{color:#697386} form{display:grid;gap:12px;margin-top:18px}
    label{display:grid;gap:5px;font-weight:700;color:#3f4757} input{width:100%;box-sizing:border-box;border:1px solid #d9dee7;border-radius:7px;padding:9px;color:#18202f}
    .check{display:flex;align-items:center;gap:8px}.check input{width:auto} button{border:1px solid #174ee7;background:#1f5eff;color:#fff;border-radius:7px;padding:10px 12px;font-weight:800;cursor:pointer}
    code{background:#f2f4f8;border-radius:5px;padding:2px 5px} dt{font-weight:800;margin-top:8px} dd{margin:3px 0 0}
    .error,.success{margin:12px 0;padding:10px;border-radius:7px}.error{background:#fff3f0;border:1px solid #f0b8b1;color:#b42318}.success{background:#ecfdf5;border:1px solid #6ee7b7;color:#166534}
    </style></head><body>';
}

function e(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
}
