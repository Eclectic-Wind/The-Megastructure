import { elements } from './elements.js';
import { config } from './config.js';

export const DarkMode = {
    isDarkModeEnabled() {
        return localStorage.getItem(config.darkMode.storageKey) !== 'false';
    },

    toggleDarkMode() {
        const isDarkMode = !this.isDarkModeEnabled();
        localStorage.setItem(config.darkMode.storageKey, isDarkMode);
        // The sun/moon travel animation only plays once the toggle is used,
        // not when the page first loads.
        document.documentElement.classList.add('toggle-animated');
        this.keepToggleOpen();
        this.applyDarkMode(isDarkMode);
    },

    // Keep the toggle slid out while the sun/moon travels, so the animation
    // is seen even if the pointer moves away, and by keyboard/touch users.
    keepToggleOpen() {
        const toggle = elements.darkModeToggle;
        if (!toggle) {
            return;
        }

        const duration =
            parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mode-icon-animation-duration')) || 0.7;
        toggle.classList.add('is-switching');
        clearTimeout(this.switchingTimer);
        this.switchingTimer = setTimeout(() => toggle.classList.remove('is-switching'), duration * 1000 + 250);
    },

    applyDarkMode(enable) {
        document.documentElement.classList.toggle('dark-mode', enable);
        document.documentElement.classList.toggle('light-mode', !enable);

        if (elements.darkModeToggle) {
            const label = enable ? 'Switch to light mode' : 'Switch to dark mode';
            elements.darkModeToggle.removeAttribute('aria-pressed');
            elements.darkModeToggle.setAttribute('aria-label', label);
        }
    },

    init() {
        if (elements.darkModeToggle) {
            elements.darkModeToggle.addEventListener('click', () => this.toggleDarkMode());
            elements.darkModeToggle.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    this.toggleDarkMode();
                }
            });
        }
        this.applyDarkMode(this.isDarkModeEnabled());
    }
};
