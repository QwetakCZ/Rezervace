<?php
require 'c:\xampp82\htdocs\stolni-tenis-rezervace\api\vendor\autoload.php';
$c = App\Booting::boot()->createContainer();
$p = $c->createInstance('App\Presenters\DataApiPresenter');
$p->actionInit(1);
