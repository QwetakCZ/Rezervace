<?php
require __DIR__ . '/../vendor/autoload.php';

$configurator = App\Booting::boot();
$container = $configurator->createContainer();

$httpRequest = $container->getByType(Nette\Http\IRequest::class);
$url = $httpRequest->getUrl();

header('Content-Type: text/plain');
echo "Script Path: " . $url->getScriptPath() . "\n";
echo "Base Path: " . $url->getBasePath() . "\n";
echo "Relative Path: " . $url->getRelativePath() . "\n";
echo "Path Info: " . $url->getPathInfo() . "\n";
