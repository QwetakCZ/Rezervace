<?php

declare(strict_types=1);

namespace App\Presenters;

use Nette\Application\UI\Presenter;

abstract class BaseApiPresenter extends Presenter
{
    public function startup(): void
    {
        parent::startup();

        // Vypnutí Tracy Debug Baru pro API dotazy (aby nerozbil JSON)
        \Tracy\Debugger::$showBar = false;

        // CORS headers
        $response = $this->getHttpResponse();
        if ($response) {
            $response->setHeader('Access-Control-Allow-Origin', '*');
            $response->setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
            $response->setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
        }

        // Handle preflight requests
        $request = $this->getHttpRequest();
        if ($request && $request->getMethod() === 'OPTIONS') {
            $this->sendResponse(new \Nette\Application\Responses\TextResponse(''));
        }
    }

    protected function sendJsonData(array $data, int $code = 200): void
    {
        $response = $this->getHttpResponse();
        if ($response) {
            $response->setCode($code);
        }
        $this->sendJson($data);
    }

    protected function sendError(string $message, int $code = 400): void
    {
        $this->sendJsonData(['status' => 'error', 'message' => $message], $code);
    }
}
