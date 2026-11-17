<?php

beforeEach(fn () => $this->withoutVite());

it('responds to the health check', function () {
    $this->get('/up')->assertOk();
});

it('serves the SPA shell on every client route', function (string $path) {
    $this->get($path)->assertOk()->assertSee('<div id="app"></div>', false);
})->with(['/', '/display', '/control', '/pair', '/pair?x=1', '/some/deep/link', '/__shell']);

it('does not serve the shell for api paths', function () {
    $this->getJson('/api/nope')->assertNotFound();
});
