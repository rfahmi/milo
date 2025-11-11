<?php
// Diagnostic script to check PHP extensions and database connectivity

header('Content-Type: application/json');

$diagnostics = [
    'php_version' => phpversion(),
    'loaded_extensions' => get_loaded_extensions(),
    'pdo_drivers' => PDO::getAvailableDrivers(),
    'pdo_pgsql_loaded' => extension_loaded('pdo_pgsql'),
    'pdo_sqlite_loaded' => extension_loaded('pdo_sqlite'),
    'environment' => [
        'DATABASE_URL_set' => !empty(getenv('DATABASE_URL')),
        'DATABASE_URL_length' => strlen(getenv('DATABASE_URL') ?: ''),
    ]
];

// Try to connect to PostgreSQL if DATABASE_URL is set
if (getenv('DATABASE_URL')) {
    try {
        if (!extension_loaded('pdo_pgsql')) {
            $diagnostics['postgres_test'] = [
                'status' => 'error',
                'message' => 'pdo_pgsql extension not loaded'
            ];
        } else {
            $db = new PDO(getenv('DATABASE_URL'));
            $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $version = $db->query('SELECT version()')->fetchColumn();
            $diagnostics['postgres_test'] = [
                'status' => 'success',
                'message' => 'Connected successfully',
                'version' => $version
            ];
        }
    } catch (PDOException $e) {
        $diagnostics['postgres_test'] = [
            'status' => 'error',
            'message' => $e->getMessage()
        ];
    }
}

echo json_encode($diagnostics, JSON_PRETTY_PRINT);
