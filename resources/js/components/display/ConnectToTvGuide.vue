<template>
    <div class="space-y-3 text-sm text-neutral-300" data-testid="connect-guide">
        <ol class="list-decimal space-y-1 pl-5">
            <li>Connect the laptop to the TV or projector with HDMI (or a USB-C adapter).</li>
            <li>Set the displays to <strong class="text-white">Extend</strong>, not Mirror.</li>
            <li>Use <strong class="text-white">Present on screen…</strong>, or drag this window onto the TV and press <kbd class="kbd">F</kbd>.</li>
        </ol>
        <div>
            <p class="font-semibold text-white">Windows</p>
            <p>Press <kbd class="kbd">Win</kbd> + <kbd class="kbd">P</kbd> and choose <em>Extend</em>.</p>
        </div>
        <div>
            <p class="font-semibold text-white">macOS</p>
            <p>System Settings → Displays → choose the TV → <em>Use as: Extended display</em> (turn off mirroring).</p>
        </div>
        <div>
            <p class="font-semibold text-white">Before the event</p>
            <ul class="list-disc space-y-1 pl-5">
                <li>Plug the laptop into power and disable sleep and the screensaver.</li>
                <li>If the edges are cut off, set the TV picture size to <em>Just Scan</em> / <em>Screen Fit</em> (the stage keeps a 5% safe area anyway).</li>
                <li>Install StageCue as an app for a window without tabs.</li>
            </ul>
        </div>
    </div>
</template>

<style scoped>
.kbd {
    border-radius: 0.25rem;
    background: rgb(255 255 255 / 0.12);
    padding: 0 0.35rem;
    font-family: ui-monospace, monospace;
    font-size: 0.8em;
}
</style>
