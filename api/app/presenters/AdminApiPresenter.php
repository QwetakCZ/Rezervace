<?php

declare(strict_types=1);

namespace App\Presenters;

use Nette;
use Nette\Application\Responses\JsonResponse;
use Nette\Database\Context;

final class AdminApiPresenter extends BaseApiPresenter
{
    /** @inject */
    public Context $database;

    public function actionSettings(int $clubId = 1): void
    {
        $request = $this->getHttpRequest();
        $method = $request->getMethod();

        if ($method === 'GET') {
            $this->handleGetSettings($clubId);
            return;
        }

        if ($method === 'POST') {
            $this->handlePostSettings($clubId, $request);
            return;
        }

        $this->sendResponse(new JsonResponse(['status' => 'error', 'message' => 'Method not allowed']));
    }

    public function actionDashboard(int $clubId = 1): void
    {
        try {
            $today = (new \DateTime())->format('Y-m-d');

            // 1. Statistiky
            $todayReservationsCount = $this->database->table('reservation_slots')
                ->where('date', $today)
                ->where('reservation.company_id', $clubId)
                ->group('reservation_id')
                ->count('*');

            $todayRevenue = $this->database->table('reservation_slots')
                ->where('date', $today)
                ->where('reservation.company_id', $clubId)
                ->where('reservation.status !=', 'cancelled')
                ->sum('price') ?: 0;

            $expectedRevenue = $this->database->table('reservation_slots')
                ->where('date >', $today)
                ->where('reservation.company_id', $clubId)
                ->where('reservation.status !=', 'cancelled')
                ->sum('price') ?: 0;

            $actualizedRevenue = $this->database->table('reservation_slots')
                ->where('date <', $today)
                ->where('reservation.company_id', $clubId)
                ->where('reservation.status !=', 'cancelled')
                ->sum('price') ?: 0;

            $newUsersCount = $this->database->table('users')
                ->where('company_id', $clubId)
                ->where('DATE(created_at)', $today)
                ->count('*');

            // 2. Seznam dnešních rezervací (aggreagovaných z slotů)
            // Tip: Nette Database Explorer automaticky JOINuje tabulky přes cizí klíče
            $todaySlots = $this->database->table('reservation_slots')
                ->where('date', $today)
                ->where('reservation.company_id', $clubId)
                ->order('time_start ASC')
                ->fetchAll();

            $reservationsList = [];
            foreach ($todaySlots as $slot) {
                $resId = $slot->reservation_id;
                if (!isset($reservationsList[$resId])) {
                    $res = $slot->reservation;
                    $user = $res->user;

                    // Formátování časů start/end
                    $fmtTime = function ($val) {
                        if ($val instanceof \DateInterval)
                            return $val->format('%H:%I');
                        if ($val instanceof \DateTimeInterface)
                            return $val->format('H:i');
                        return substr((string) $val, 0, 5);
                    };

                    $reservationsList[$resId] = [
                        'id' => $resId,
                        'time' => '', // doplníme později
                        'time_start' => $fmtTime($slot->time_start),
                        'time_end' => $fmtTime($slot->time_end),
                        'resource' => $slot->resource->name,
                        'user' => $user->first_name . ' ' . $user->last_name,
                        'status' => $res->status,
                        'price' => (float) $res->total_price,
                    ];
                } else {
                    $fmtTime = function ($val) {
                        if ($val instanceof \DateInterval)
                            return $val->format('%H:%I');
                        if ($val instanceof \DateTimeInterface)
                            return $val->format('H:i');
                        return substr((string) $val, 0, 5);
                    };
                    $reservationsList[$resId]['time_end'] = $fmtTime($slot->time_end);
                }
            }

            // Finalizace formátu času pro tabulku
            foreach ($reservationsList as &$r) {
                $r['time'] = $r['time_start'] . ' - ' . $r['time_end'];
            }

            $payload = [
                'status' => 'success',
                'data' => [
                    'stats' => [
                        'todayReservations' => $todayReservationsCount,
                        'todayRevenue' => (float) $todayRevenue,
                        'expectedRevenue' => (float) $expectedRevenue,
                        'actualizedRevenue' => (float) $actualizedRevenue,
                        'newUsers' => $newUsersCount,
                    ],
                    'todayReservations' => array_values($reservationsList)
                ]
            ];

        } catch (\Throwable $e) {
            $payload = [
                'status' => 'error',
                'message' => $e->getMessage()
            ];
        }

        $this->sendResponse(new JsonResponse($payload));
    }

    public function actionReservations(int $clubId = 1): void
    {
        try {
            $reservationsRows = $this->database->table('reservations')
                ->where('company_id', $clubId)
                ->order('created_at DESC')
                ->fetchAll();

            $result = [];
            foreach ($reservationsRows as $res) {
                $user = $res->user;
                $slots = $res->related('reservation_slots')->order('date ASC, time_start ASC');

                $dateStr = 'N/A';
                $timeRange = 'N/A';

                $firstSlot = $slots->fetch();
                if ($firstSlot) {
                    $fmtTime = function ($val) {
                        if ($val instanceof \DateInterval)
                            return $val->format('%H:%I');
                        if ($val instanceof \DateTimeInterface)
                            return $val->format('H:i');
                        return substr((string) $val, 0, 5);
                    };

                    $dateStr = $firstSlot->date->format('d.m.Y');
                    $timeStart = $fmtTime($firstSlot->time_start);
                    $lastSlot = $firstSlot;
                    while ($nextSlot = $slots->fetch()) {
                        $lastSlot = $nextSlot;
                    }
                    $timeEnd = $fmtTime($lastSlot->time_end);
                    $timeRange = $timeStart . ' - ' . $timeEnd;
                }

                $result[] = [
                    'id' => $res->id,
                    'user' => $user->first_name . ' ' . $user->last_name . ' (' . $user->email . ')',
                    'category' => $res->category->name,
                    'date' => $dateStr,
                    'time' => $timeRange,
                    'total_price' => (float) $res->total_price,
                    'status' => $res->status,
                    'created_at' => $res->created_at->format('d.m.Y H:i'),
                ];
            }

            $payload = [
                'status' => 'success',
                'data' => [
                    'reservations' => $result
                ]
            ];

        } catch (\Throwable $e) {
            $payload = [
                'status' => 'error',
                'message' => $e->getMessage()
            ];
        }

        $this->sendResponse(new JsonResponse($payload));
    }

    public function actionUpdateStatus(int $id, string $status): void
    {
        try {
            $this->database->table('reservations')
                ->where('id', $id)
                ->update(['status' => $status]);

            $payload = [
                'status' => 'success',
                'message' => 'Stav rezervace byl aktualizován.'
            ];
        } catch (\Throwable $e) {
            $payload = [
                'status' => 'error',
                'message' => $e->getMessage()
            ];
        }

        $this->sendResponse(new JsonResponse($payload));
    }

    public function actionDeleteReservation(int $id): void
    {
        try {
            // Smazání vázaných slotů (pokud není zapnut cascade v DB)
            $this->database->table('reservation_slots')
                ->where('reservation_id', $id)
                ->delete();

            $count = $this->database->table('reservations')
                ->where('id', $id)
                ->delete();

            if ($count === 0) {
                throw new \Exception('Rezervace nenalezena.');
            }

            $payload = [
                'status' => 'success',
                'message' => 'Rezervace byla smazána.'
            ];
        } catch (\Throwable $e) {
            $payload = [
                'status' => 'error',
                'message' => $e->getMessage()
            ];
        }

        $this->sendResponse(new JsonResponse($payload));
    }

    public function actionPlayers(int $clubId = 1): void
    {
        try {
            $users = $this->database->table('users')
                ->where('company_id', $clubId)
                ->order('last_name ASC, first_name ASC')
                ->fetchAll();

            $result = [];
            foreach ($users as $u) {
                // Registrovaný hráč = má nastavené heslo (libovolný sloupec, co v DB najdeme)
                $hasPassword = !empty($u->password) || !empty($u->password_hash);

                $result[] = [
                    'id' => $u->id,
                    'first_name' => $u->first_name,
                    'last_name' => $u->last_name,
                    'email' => $u->email,
                    'phone' => $u->phone,
                    'role' => $u->role,
                    'is_registered' => $hasPassword,
                    'created_at' => $u->created_at ? $u->created_at->format('d.m.Y H:i') : '---',
                ];
            }

            $payload = [
                'status' => 'success',
                'data' => [
                    'players' => $result
                ]
            ];
        } catch (\Throwable $e) {
            $payload = [
                'status' => 'error',
                'message' => $e->getMessage()
            ];
        }

        $this->sendResponse(new JsonResponse($payload));
    }

    private function handleGetSettings(int $clubId): void
    {
        try {
            // Načteme kategorie pro daný klub
            $categoriesData = $this->database->table('categories')
                ->where('company_id', $clubId)
                ->fetchAll();

            $result = [];

            foreach ($categoriesData as $category) {
                // Načteme resources (stoly) pro kategorii
                $resourcesData = $this->database->table('resources')
                    ->where('category_id', $category->id)
                    ->fetchAll();

                $resources = [];
                foreach ($resourcesData as $res) {
                    $resources[] = [
                        'id' => $res->id,
                        'name' => $res->name,
                        'is_active' => (bool) $res->is_active,
                    ];
                }

                // Načteme cenová okna pro kategorii
                $pricingData = $this->database->table('pricing_windows')
                    ->where('category_id', $category->id)
                    ->fetchAll();

                $pricingWindows = [];
                foreach ($pricingData as $price) {
                    $timeFrom = $price->time_from;
                    if ($timeFrom instanceof \DateInterval) {
                        $timeFrom = $timeFrom->format('%H:%I');
                    }
                    $timeTo = $price->time_to;
                    if ($timeTo instanceof \DateInterval) {
                        $timeTo = $timeTo->format('%H:%I');
                    }

                    $pricingWindows[] = [
                        'id' => $price->id,
                        'day_of_week' => (int) $price->day_of_week,
                        'time_from' => $timeFrom,
                        'time_to' => $timeTo,
                        'price_per_slot' => (float) $price->price_per_slot,
                    ];
                }

                $result[] = [
                    'id' => $category->id,
                    'name' => $category->name,
                    'description' => $category->description,
                    'default_slot_duration' => $category->default_slot_duration,
                    'resources' => $resources,
                    'pricing_windows' => $pricingWindows,
                ];
            }

            $payload = [
                'status' => 'success',
                'data' => [
                    'categories' => $result
                ]
            ];

        } catch (\Throwable $e) {
            $payload = [
                'status' => 'error',
                'message' => $e->getMessage(),
                'file' => $e->getFile(),
                'line' => $e->getLine()
            ];
        }

        $this->sendResponse(new JsonResponse($payload));
    }

    private function handlePostSettings(int $clubId, Nette\Http\IRequest $request): void
    {
        try {
            $body = json_decode($request->getRawBody() ?: '', true);
            if (!isset($body['categories']) || !is_array($body['categories'])) {
                throw new \Exception('Invalid payload schema. Expected "categories" array.');
            }

            $this->database->beginTransaction();

            $incomingCategoryIds = [];

            foreach ($body['categories'] as $catData) {
                // 1. Zpracování Kategorie
                if (isset($catData['id']) && strpos((string) $catData['id'], 'new-') === false) {
                    // Update exitující kategorie
                    $this->database->table('categories')
                        ->where('id', $catData['id'])
                        ->where('company_id', $clubId)
                        ->update([
                            'name' => $catData['name'],
                            'description' => $catData['description'] ?? null,
                            'default_slot_duration' => $catData['default_slot_duration'] ?? 30,
                        ]);
                    $categoryId = $catData['id'];
                } else {
                    // Insert nové kategorie
                    $newCat = $this->database->table('categories')->insert([
                        'company_id' => $clubId,
                        'name' => $catData['name'],
                        'description' => $catData['description'] ?? null,
                        'default_slot_duration' => $catData['default_slot_duration'] ?? 30,
                    ]);
                    $categoryId = $newCat->id;
                }
                $incomingCategoryIds[] = $categoryId;

                // 2. Zpracování Resources (Stolů)
                $incomingResourceIds = [];
                if (isset($catData['resources']) && is_array($catData['resources'])) {
                    foreach ($catData['resources'] as $resData) {
                        if (isset($resData['id']) && strpos((string) $resData['id'], 'new-') === false) {
                            $this->database->table('resources')
                                ->where('id', $resData['id'])
                                ->where('category_id', $categoryId)
                                ->update([
                                    'name' => $resData['name'],
                                    'is_active' => $resData['is_active'] ?? 1,
                                ]);
                            $incomingResourceIds[] = $resData['id'];
                        } else {
                            $newRes = $this->database->table('resources')->insert([
                                'category_id' => $categoryId,
                                'name' => $resData['name'],
                                'is_active' => $resData['is_active'] ?? 1,
                            ]);
                            $incomingResourceIds[] = $newRes->id;
                        }
                    }
                }

                // Smazat resources
                if (count($incomingResourceIds) > 0) {
                    $this->database->table('resources')
                        ->where('category_id', $categoryId)
                        ->where('id NOT IN', $incomingResourceIds)
                        ->delete();
                } else {
                    $this->database->table('resources')
                        ->where('category_id', $categoryId)
                        ->delete();
                }

                // 3. Zpracování Pricing Windows
                $incomingPricingIds = [];
                if (isset($catData['pricing_windows']) && is_array($catData['pricing_windows'])) {
                    foreach ($catData['pricing_windows'] as $priceData) {
                        if (isset($priceData['id']) && strpos((string) $priceData['id'], 'new-') === false) {
                            $this->database->table('pricing_windows')
                                ->where('id', $priceData['id'])
                                ->where('category_id', $categoryId)
                                ->update([
                                    'day_of_week' => $priceData['day_of_week'],
                                    'time_from' => $priceData['time_from'],
                                    'time_to' => $priceData['time_to'],
                                    'price_per_slot' => $priceData['price_per_slot'],
                                ]);
                            $incomingPricingIds[] = $priceData['id'];
                        } else {
                            $newPrice = $this->database->table('pricing_windows')->insert([
                                'category_id' => $categoryId,
                                'day_of_week' => $priceData['day_of_week'],
                                'time_from' => $priceData['time_from'],
                                'time_to' => $priceData['time_to'],
                                'price_per_slot' => $priceData['price_per_slot'],
                            ]);
                            $incomingPricingIds[] = $newPrice->id;
                        }
                    }
                }

                // Smazat cenovky
                if (count($incomingPricingIds) > 0) {
                    $this->database->table('pricing_windows')
                        ->where('category_id', $categoryId)
                        ->where('id NOT IN', $incomingPricingIds)
                        ->delete();
                } else {
                    $this->database->table('pricing_windows')
                        ->where('category_id', $categoryId)
                        ->delete();
                }
            }

            // Nakonec smazat kategorie
            if (count($incomingCategoryIds) > 0) {
                $this->database->table('categories')
                    ->where('company_id', $clubId)
                    ->where('id NOT IN', $incomingCategoryIds)
                    ->delete();
            } else {
                $this->database->table('categories')
                    ->where('company_id', $clubId)
                    ->delete();
            }

            $this->database->commit();

            $payload = [
                'status' => 'success',
                'message' => 'Settings updated successfully'
            ];

        } catch (\Throwable $e) {
            $this->database->rollBack();
            $payload = [
                'status' => 'error',
                'message' => $e->getMessage()
            ];
        }

        $this->sendResponse(new JsonResponse($payload));
    }
}
