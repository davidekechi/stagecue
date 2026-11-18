<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('presentation_sessions', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->string('display_name', 60);
            $table->string('status', 16)->default('active');
            $table->string('pairing_code', 6)->nullable()->unique();
            $table->string('pairing_token_hash', 64)->nullable()->unique();
            $table->timestamp('pairing_expires_at')->nullable();
            $table->smallInteger('pairing_failed_attempts')->default(0);
            $table->bigInteger('command_seq')->default(0);
            $table->jsonb('last_snapshot')->nullable();
            $table->string('last_presentation_id', 64)->nullable();
            $table->bigInteger('last_revision')->nullable();
            $table->timestamp('last_snapshot_at')->nullable();
            $table->timestamp('last_activity_at');
            $table->timestamp('ended_at')->nullable();
            $table->timestamps();

            $table->index(['status', 'last_activity_at']);
        });

        Schema::create('devices', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('session_id')->constrained('presentation_sessions')->cascadeOnDelete();
            $table->string('role', 16);
            $table->string('name', 60);
            $table->string('user_agent', 255)->nullable();
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();

            $table->index(['session_id', 'role', 'revoked_at']);
        });

        Schema::create('session_commands', function (Blueprint $table) {
            $table->id();
            $table->foreignUlid('session_id')->constrained('presentation_sessions')->cascadeOnDelete();
            $table->uuid('command_id');
            $table->foreignUlid('device_id')->constrained('devices')->cascadeOnDelete();
            $table->bigInteger('seq');
            $table->string('name', 32);
            $table->jsonb('payload');
            $table->bigInteger('base_revision')->nullable();
            $table->string('status', 16);
            $table->string('result_code', 32)->nullable();
            $table->timestamp('relayed_at', 3);
            $table->timestamp('acked_at')->nullable();

            $table->unique(['session_id', 'command_id']);
            $table->index(['session_id', 'seq']);
            $table->index('relayed_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('session_commands');
        Schema::dropIfExists('devices');
        Schema::dropIfExists('presentation_sessions');
    }
};
