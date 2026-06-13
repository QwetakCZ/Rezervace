<?php
/**
 * Databázové připojení a pomocné funkce
 */

class DB
{
    private static ?PDO $pdo = null;

    public static function connect(array $config): PDO
    {
        if (self::$pdo === null) {
            $dsn = sprintf(
                'mysql:host=%s;port=%s;dbname=%s;charset=%s',
                $config['host'],
                $config['port'],
                $config['dbname'],
                $config['charset']
            );
            $options = [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ];
            // SSL jen pro vzdálené servery (Active24), ne pro localhost
            if (!in_array($config['host'], ['localhost', '127.0.0.1', '::1'])) {
                // PHP 8.5+: Pdo\Mysql::ATTR_SSL_VERIFY_SERVER_CERT, starší: PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT
                $sslVerifyConst = defined('Pdo\Mysql::ATTR_SSL_VERIFY_SERVER_CERT')
                    ? Pdo\Mysql::ATTR_SSL_VERIFY_SERVER_CERT
                    : PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT;
                $options[$sslVerifyConst] = false;
            }
            self::$pdo = new PDO($dsn, $config['username'], $config['password'], $options);
        }
        return self::$pdo;
    }

    public static function query(string $sql, array $params = []): array
    {
        $stmt = self::$pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public static function queryOne(string $sql, array $params = []): ?array
    {
        $rows = self::query($sql, $params);
        return $rows[0] ?? null;
    }

    public static function insert(string $sql, array $params = []): int
    {
        $stmt = self::$pdo->prepare($sql);
        $stmt->execute($params);
        return (int) self::$pdo->lastInsertId();
    }

    public static function exec(string $sql, array $params = []): int
    {
        $stmt = self::$pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->rowCount();
    }

    public static function beginTransaction(): void
    {
        self::$pdo->beginTransaction();
    }

    public static function commit(): void
    {
        self::$pdo->commit();
    }

    public static function rollback(): void
    {
        if (self::$pdo->inTransaction()) {
            self::$pdo->rollBack();
        }
    }
}
