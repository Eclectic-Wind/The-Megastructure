import { elements } from './elements.js';
import { config } from './config.js';

export const DarkMode = {
    isDarkModeEnabled() {
        return localStorage.getItem(config.darkMode.storageKey) !== 'false';
    },

    prefersReducedMotion() {
        return Boolean(
            window.matchMedia &&
                window.matchMedia('(prefers-reduced-motion: reduce)').matches
        );
    },

    toggleDarkMode() {
        const isDarkMode = !this.isDarkModeEnabled();
        localStorage.setItem(config.darkMode.storageKey, isDarkMode);

        // Where supported, reveal the new theme as a circle spreading out
        // from the toggle's knob; otherwise just switch (colours still ease).
        if (!document.startViewTransition || this.prefersReducedMotion()) {
            this.applyDarkMode(isDarkMode);
            return;
        }

        const origin = this.getKnobCentre();
        const radius = Math.hypot(
            Math.max(origin.x, window.innerWidth - origin.x),
            Math.max(origin.y, window.innerHeight - origin.y)
        );

        document.documentElement.classList.add('theme-switching');
        const transition = document.startViewTransition(() => this.applyDarkMode(isDarkMode));

        transition.ready
            .then(() => {
                document.documentElement.animate(
                    {
                        clipPath: [
                            `circle(0px at ${origin.x}px ${origin.y}px)`,
                            `circle(${radius}px at ${origin.x}px ${origin.y}px)`,
                        ],
                    },
                    {
                        duration: 550,
                        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
                        pseudoElement: '::view-transition-new(root)',
                    }
                );
            })
            .catch(() => {});

        transition.finished.finally(() => {
            document.documentElement.classList.remove('theme-switching');
        });
    },

    getKnobCentre() {
        const knob = elements.darkModeToggle && elements.darkModeToggle.querySelector('.toggle-knob');
        if (!knob) {
            return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        }

        const rect = knob.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    },

    applyDarkMode(enable) {
        document.documentElement.classList.toggle('dark-mode', enable);
        document.documentElement.classList.toggle('light-mode', !enable);

        if (elements.darkModeToggle) {
            const label = enable ? 'Switch to light mode' : 'Switch to dark mode';
            elements.darkModeToggle.removeAttribute('aria-pressed');
            elements.darkModeToggle.setAttribute('aria-label', label);
            const knob = elements.darkModeToggle.querySelector('.toggle-knob');
            if (knob) {
                knob.setAttribute('data-label', label);
            }
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
