const modeButtons = Array.from(document.querySelectorAll('.mode-button'));
const downloadButton = document.getElementById('downloadButton');
const input = document.getElementById('urlInput');

for (const button of modeButtons) {
    button.addEventListener('click', () => {
        if (button.classList.contains('active')) {
            return;
        }

        for (const b of modeButtons) {
            b.classList.remove('active');
            b.setAttribute('aria-checked', 'false');
        }

        button.classList.add('active');
        button.setAttribute('aria-checked', 'true');
    });
}

// UI-only behavior for now while functionality is being decided.
downloadButton?.addEventListener('click', () => {
    downloadButton.classList.add('pulse');
    setTimeout(() => {
        downloadButton.classList.remove('pulse');
    }, 140);

    // Keep current value available for future logic.
    input?.blur();
});
