<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
    <meta name="theme-color" content="#000000">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black">
    <meta name="apple-mobile-web-app-title" content="StageCue">
    <title>StageCue</title>
    <link rel="manifest" href="/build/manifest.webmanifest">
    <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png">
    <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon-180.png">
    {{-- 06-Deployment §4: runtime (not build-time) client config. No secrets. --}}
    <script id="stagecue-config" type="application/json">{!! json_encode(\App\Support\ClientConfig::forShell(), JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_SLASHES) !!}</script>
    @vite(['resources/js/main.ts'])
</head>
<body>
    <div id="app"></div>
</body>
</html>
