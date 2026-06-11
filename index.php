<?php

header('X-Robots-Tag: noindex, nofollow, noarchive, nosnippet');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');

$html = file_get_contents(__DIR__ . '/public/index.html');

if ($html === false) {
    http_response_code(500);
    echo 'Application entry file not found.';
    exit;
}

echo str_replace('<head>', '<head>' . PHP_EOL . '  <base href="/public/">', $html);
