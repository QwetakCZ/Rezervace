<?php

declare(strict_types=1);

namespace App;

use Nette\Configurator;


class Booting
{
	public static function boot(): Configurator
	{
		error_reporting(E_ALL & ~E_DEPRECATED & ~E_USER_DEPRECATED);
		$configurator = new Configurator;
		$configurator->setDebugMode(false); // Vypnout pro čisté JSON API bez modrých obrazovek
		$configurator->enableTracy(__DIR__ . '/../log');

		$configurator->setTimeZone('Europe/Prague');
		$configurator->setTempDirectory(__DIR__ . '/../temp');

		$configurator->createRobotLoader()
			->addDirectory(__DIR__)
			->register();

		$configurator->addConfig(__DIR__ . '/config/common.neon');
		$configurator->addConfig(__DIR__ . '/config/local.neon');

		return $configurator;
	}
}
