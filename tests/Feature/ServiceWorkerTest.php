<?php

use Illuminate\Support\Facades\File;

beforeEach(fn () => $this->withoutVite());

it('serves the service worker from the root scope with the right headers', function () {
    $path = public_path('build/sw.js');
    $existed = is_file($path);
    if (! $existed) {
        File::ensureDirectoryExists(dirname($path));
        File::put($path, '// test sw');
    }

    try {
        $response = $this->get('/sw.js');
        $response->assertOk();
        expect($response->headers->get('Content-Type'))->toStartWith('text/javascript');
        expect($response->headers->get('Cache-Control'))->toContain('no-cache');
        expect($response->headers->get('Service-Worker-Allowed'))->toBe('/');
    } finally {
        if (! $existed) {
            File::delete($path);
        }
    }
});

it('links the manifest from the shell', function () {
    $this->get('/display')->assertSee('/build/manifest.webmanifest', false);
});
