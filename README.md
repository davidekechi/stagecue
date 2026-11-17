# StageCue

A real-time presentation timer with remote messaging. A laptop **Display** drives the TV; a phone **Controller** sends commands. The Display is authoritative and keeps presenting even when the network, the phone or the backend fails.

Stack: Laravel 13 (PHP 8.4) modular monolith · Vue 3 + TypeScript PWA · Reverb WebSockets · Postgres · Laravel Cloud.

## Docs

Start at [`docs/README.md`](docs/README.md) (binding decisions D1–D14 and the ambiguity log). The backlog is in [`docs/07-Backlog.md`](docs/07-Backlog.md).

## Local development

Requirements: PHP 8.4, Composer, Node 22+, Postgres (a Docker container works).

```bash
docker run -d --name stagecue-pg -e POSTGRES_USER=stagecue -e POSTGRES_PASSWORD=secret \
  -e POSTGRES_DB=stagecue -p 5433:5432 postgres:17
docker exec stagecue-pg psql -U stagecue -c 'CREATE DATABASE stagecue_test'

composer install && npm install
cp .env.example .env && php artisan key:generate   # set DB_PASSWORD=secret
php artisan migrate
composer run dev        # serve + vite + reverb + scheduler
```

## Checks

```bash
npm run lint && npm run test && vendor/bin/pest
```
