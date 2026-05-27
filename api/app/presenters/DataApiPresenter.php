<?php

declare(strict_types=1);

namespace App\Presenters;

use Nette\Database\Context;

final class DataApiPresenter extends BaseApiPresenter
{
    /** @inject */
    public Context $database;

    public function actionInit(int $clubId = 1): void
    {
        $categoriesRows = $this->database->table('categories')
            ->where('company_id', $clubId)
            ->fetchAll();

        $categories = [];
        $categoryIds = [];

        foreach ($categoriesRows as $cat) {
            $categoryId = $cat['id'];
            $categoryIds[] = $categoryId;
            $categories[$categoryId] = [
                'id' => $categoryId,
                'name' => $cat['name'],
                'default_slot_duration' => $cat['default_slot_duration'],
                'resources' => [],
                'pricing_windows' => []
            ];
        }

        if (!empty($categoryIds)) {
            $resources = $this->database->table('resources')
                ->where('category_id', $categoryIds)
                ->where('is_active', 1)
                ->fetchAll();

            foreach ($resources as $res) {
                $categories[$res['category_id']]['resources'][] = [
                    'id' => $res['id'],
                    'name' => $res['name']
                ];
            }

            $pricing = $this->database->table('pricing_windows')
                ->where('category_id', $categoryIds)
                ->fetchAll();

            foreach ($pricing as $price) {
                $timeFromVal = $price['time_from'];
                if ($timeFromVal instanceof \DateInterval) {
                    $timeFrom = $timeFromVal->format('%H:%I');
                } elseif ($timeFromVal instanceof \DateTimeInterface) {
                    $timeFrom = $timeFromVal->format('H:i');
                } else {
                    $timeFrom = substr((string) $timeFromVal, 0, 5);
                }

                $timeToVal = $price['time_to'];
                if ($timeToVal instanceof \DateInterval) {
                    $timeTo = $timeToVal->format('%H:%I');
                } elseif ($timeToVal instanceof \DateTimeInterface) {
                    $timeTo = $timeToVal->format('H:i');
                } else {
                    $timeTo = substr((string) $timeToVal, 0, 5);
                }

                $categories[$price['category_id']]['pricing_windows'][] = [
                    'day_of_week' => $price['day_of_week'],
                    'time_from' => $timeFrom,
                    'time_to' => $timeTo,
                    'price_per_slot' => (float) $price['price_per_slot']
                ];
            }
        }

        $this->sendJsonData([
            'status' => 'success',
            'data' => [
                'categories' => array_values($categories)
            ]
        ]);
    }

    public function actionAvailability(int $clubId = 1, string $date = '', int $categoryId = 0): void
    {
        if (empty($date)) {
            $date = (new \DateTime())->format('Y-m-d');
        }

        try {
            // Načteme všechny obsazené sloty pro danou kategorii a datum
            $slots = $this->database->table('reservation_slots')
                ->where('date', $date)
                ->where('reservation.category_id', $categoryId)
                ->where('reservation.company_id', $clubId)
                ->where('reservation.status !=', 'cancelled')
                ->fetchAll();

            $occupied = [];
            foreach ($slots as $slot) {
                $timeVal = $slot->time_start;
                if ($timeVal instanceof \DateInterval) {
                    $time = $timeVal->format('%H:%I');
                } elseif ($timeVal instanceof \DateTimeInterface) {
                    $time = $timeVal->format('H:i');
                } else {
                    $time = substr((string) $timeVal, 0, 5);
                }

                $occupied[] = [
                    'resourceId' => $slot->resource_id,
                    'time' => $time
                ];
            }

            $payload = [
                'status' => 'success',
                'data' => [
                    'occupied' => $occupied
                ]
            ];
        } catch (\Throwable $e) {
            $payload = [
                'status' => 'error',
                'message' => $e->getMessage()
            ];
        }

        $this->sendJsonData($payload);
    }

    public function actionReservation(): void
    {
        $request = $this->getHttpRequest();
        if ($request->getMethod() !== 'POST') {
            $this->sendJsonData(['status' => 'error', 'message' => 'Method not allowed']);
            return;
        }

        $payload = [];

        try {
            $body = json_decode($request->getRawBody() ?: '', true);
            if (!isset($body['clubId'], $body['categoryId'], $body['resourceId'], $body['date'], $body['slots'], $body['customer'])) {
                throw new \Exception('Invalid payload schema.');
            }

            $clubId = (int) $body['clubId'];
            $categoryId = (int) $body['categoryId'];
            $resourceId = (int) $body['resourceId'];
            $date = $body['date'];
            $slots = $body['slots'];
            $customer = $body['customer'];
            $totalPrice = (float) ($body['totalPrice'] ?? 0);

            if (empty($slots) || !is_array($slots)) {
                throw new \Exception('No slots selected.');
            }

            // Ošetření listu formátovaného: ["14:00", "14:30"] na ["14:00:00", "14:30:00"]
            $timeStartArray = array_map(function ($slot) {
                return $slot . ':00';
            }, $slots);

            // Kontrola zda dané sloty v daném datu už nejsou obsazené
            $existingSlots = $this->database->table('reservation_slots')
                ->where('resource_id', $resourceId)
                ->where('date', $date)
                ->where('time_start', $timeStartArray)
                ->count('*');

            if ($existingSlots > 0) {
                throw new \Exception('Některé vybrané časy už byly zarezervovány.');
            }

            $this->database->beginTransaction();

            // Nastavení uživatele
            $email = $customer['email'] ?? '';
            if (empty($email)) {
                throw new \Exception('Email is required.');
            }

            $userRows = $this->database->table('users')
                ->where('company_id', $clubId)
                ->where('email', $email)
                ->fetchAll();
            $user = reset($userRows);

            if (!$user) {
                $user = $this->database->table('users')->insert([
                    'company_id' => $clubId,
                    'role' => 'player',
                    'email' => $email,
                    'first_name' => $customer['firstName'] ?? '',
                    'last_name' => $customer['lastName'] ?? '',
                    'phone' => $customer['phone'] ?? '',
                ]);
            }

            // Vytvoření hlavičky rezervace
            $reservation = $this->database->table('reservations')->insert([
                'company_id' => $clubId,
                'user_id' => $user->id,
                'category_id' => $categoryId,
                'total_price' => $totalPrice,
                'status' => 'confirmed',
                'note' => $customer['note'] ?? null,
            ]);

            $pricePerSlot = count($slots) > 0 ? $totalPrice / count($slots) : 0;

            // Vyplnění položenek - 30 min slotů
            foreach ($slots as $slot) {
                $timeStartStr = $slot . ':00';
                $startObj = \DateTime::createFromFormat('H:i:s', $timeStartStr);
                if ($startObj) {
                    $startObj->modify('+30 minutes');
                    $timeEndStr = $startObj->format('H:i:s');
                } else {
                    $timeEndStr = $timeStartStr; // fallback pokud to nevyjde
                }

                $this->database->table('reservation_slots')->insert([
                    'reservation_id' => $reservation->id,
                    'resource_id' => $resourceId,
                    'date' => $date,
                    'time_start' => $timeStartStr,
                    'time_end' => $timeEndStr,
                    'price' => $pricePerSlot,
                ]);
            }

            $this->database->commit();

            $payload = [
                'status' => 'success',
                'message' => 'Rezervace byla úspěšně vytvořena.',
                'data' => [
                    'reservation_id' => $reservation->id
                ]
            ];

        } catch (\Throwable $e) {
            try {
                $this->database->rollBack();
            } catch (\Throwable $rollbackE) { /* ignore rollback errors if tx wasn't open */
            }
            $payload = [
                'status' => 'error',
                'message' => $e->getMessage()
            ];
        }

        $this->sendJsonData($payload);
    }
}
