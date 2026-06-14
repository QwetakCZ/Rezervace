<?php
/**
 * Slotová logika - výpočet dostupných slotů, lead time, atd.
 * Překlad z backend/src/slots.js
 */

class Slots
{
    const DEFAULT_SLOT_MINUTES = 30;

    /**
     * Vytvoří seznam slotů pro časové okno
     */
    public static function buildSlotsForWindow(
        string $timeFrom,
        string $timeTo,
        int $slotMinutes = self::DEFAULT_SLOT_MINUTES
    ): array {
        $from  = self::timeToMinutes($timeFrom);
        $to    = self::timeToMinutes($timeTo);
        $slots = [];

        for ($current = $from; $current + $slotMinutes <= $to; $current += $slotMinutes) {
            $slots[] = [
                'time_start' => self::minutesToTime($current),
                'time_end'   => self::minutesToTime($current + $slotMinutes),
            ];
        }

        return $slots;
    }

    /**
     * Vrátí den v týdnu (1=Po, 7=Ne) pro cenové okno
     */
    public static function dayOfWeekForPricing(string $dateString): int
    {
        $date = new DateTime($dateString . 'T12:00:00');
        $day  = (int) $date->format('N'); // 1=Po, 7=Ne
        return $day;
    }

    /**
     * Ověří, zda je slot bookovatelný s ohledem na minimální předstih
     */
    public static function isSlotBookableWithLeadTime(
        string $dateString,
        string $timeStart,
        int $minAdvanceMinutes = 0,
        ?DateTime $now = null
    ): bool {
        $now      = $now ?? new DateTime();
        $slotDate = self::toLocalDateTime($dateString, $timeStart);

        if ($slotDate === null) {
            return false;
        }

        $leadMinutes = max($minAdvanceMinutes, 0);
        $leadLimit   = $now->getTimestamp() + ($leadMinutes * 60);

        return $slotDate->getTimestamp() >= $leadLimit;
    }

    /**
     * Filtruje sloty podle lead time
     */
    public static function filterSlotsByLeadTime(
        array $resources,
        string $dateString,
        int $minAdvanceMinutes = 0,
        ?DateTime $now = null
    ): array {
        return array_map(function ($resource) use ($dateString, $minAdvanceMinutes, $now) {
            $resource['slots'] = array_values(array_filter(
                $resource['slots'] ?? [],
                fn($slot) => self::isSlotBookableWithLeadTime(
                    $dateString,
                    $slot['time_start'],
                    $minAdvanceMinutes,
                    $now
                )
            ));
            return $resource;
        }, $resources);
    }

    /**
     * Seskupí sloty podle zdrojů s informací o obsazenosti
     */
    public static function groupSlotsByResource(
        array $resources,
        array $reservedSlotRows
    ): array {
        // Vytvoří lookup: "resourceId|timeStart" => true
        $reservedLookup = [];
        foreach ($reservedSlotRows as $row) {
            $key = $row['resource_id'] . '|' . self::normalizeTime($row['time_start']);
            $reservedLookup[$key] = true;
        }

        return array_map(function ($resource) use ($reservedLookup) {
            $resourceId = $resource['resource_id'] ?? $resource['id'] ?? 0;
            $resource['slots'] = array_map(function ($slot) use ($resourceId, $reservedLookup) {
                $key = $resourceId . '|' . $slot['time_start'];
                $slot['reserved'] = isset($reservedLookup[$key]);
                $slot['available'] = !$slot['reserved'];
                return $slot;
            }, $resource['slots'] ?? []);
            return $resource;
        }, $resources);
    }

    // --- privátní helpers ---

    private static function timeToMinutes(string $time): int
    {
        $parts = explode(':', $time);
        return ((int) $parts[0] * 60) + (int) ($parts[1] ?? 0);
    }

    private static function minutesToTime(int $minutes): string
    {
        $h = floor($minutes / 60);
        $m = $minutes % 60;
        return sprintf('%02d:%02d:00', $h, $m);
    }

    private static function normalizeTime(string $time): string
    {
        if (preg_match('/^\d{2}:\d{2}$/', $time)) {
            return $time . ':00';
        }
        if (preg_match('/^\d{2}:\d{2}:\d{2}$/', $time)) {
            return $time;
        }
        return '';
    }

    private static function toLocalDateTime(string $dateString, string $time): ?DateTime
    {
        $timeNormalized = self::normalizeTime($time);
        if (!$timeNormalized) {
            return null;
        }

        $dt = DateTime::createFromFormat(
            'Y-m-d H:i:s',
            $dateString . ' ' . $timeNormalized
        );

        return ($dt === false) ? null : $dt;
    }
}
