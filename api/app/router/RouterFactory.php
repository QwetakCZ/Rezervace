<?php

declare(strict_types=1);

namespace App\Router;

use Nette;
use Nette\Application\Routers\Route;
use Nette\Application\Routers\RouteList;


final class RouterFactory
{
	use Nette\StaticClass;

	public static function createRouter(): RouteList
	{
		$router = new RouteList;

		// Nejpřímější routy - matchují od konce URL, ignorují base_path (což je na produkci /api/www/)
		$router->addRoute('data-api/<action>[/<id>]', 'DataApi:default');
		$router->addRoute('admin-api/<action>[/<id>]', 'AdminApi:default');

		// Fallback routy pro lokální Vite proxy, pokud the basepath není správně odstraněna
		$router->addRoute('api/data-api/<action>[/<id>]', 'DataApi:default');
		$router->addRoute('api/admin-api/<action>[/<id>]', 'AdminApi:default');
		$router->addRoute('api/www/data-api/<action>[/<id>]', 'DataApi:default');
		$router->addRoute('api/www/admin-api/<action>[/<id>]', 'AdminApi:default');

		// Default route
		$router->addRoute('<presenter>/<action>[/<id>]', 'Homepage:default');

		return $router;
	}
}
