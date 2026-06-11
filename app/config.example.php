<?php

return [
    'app_name' => 'Client Gantt',
    'app_url' => 'https://gantt.example.com/',
    'session_name' => 'client_gantt_session',

    'db' => [
        'host' => 'localhost',
        'database' => 'gantt_service',
        'username' => 'gantt_user',
        'password' => 'change-me',
        'charset' => 'utf8mb4',
    ],

    'auth' => [
        'username' => 'admin',
        // Generate with: php tools/hash-password.php "your-password"
        'password_hash' => '$2y$10$replace_this_hash_before_deploying',
        // Optional temporary fallback. Prefer password_hash in production.
        'password_plain' => '',
    ],
];
