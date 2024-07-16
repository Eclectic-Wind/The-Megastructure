import { elements } from './elements.js';
import { config } from './config.js';

export const DarkMode = {
    isDarkModeEnabled() {
        return localStorage.getItem(config.darkMode.storageKey) !== 'false';
    },
    
    toggleDarkMode() {
        const isDarkMode = !this.isDarkModeEnabled();
        localStorage.setItem(config.darkMode.storageKey, isDarkMode);
        this.applyDarkMode(isDarkMode);
    },
    
    applyDarkMode(enable) {
        document.documentElement.classList.toggle('dark-mode', enable);
        document.documentElement.classList.toggle('light-mode', !enable);
    },
    
    init() {
        if (elements.darkModeToggle) {
            elements.darkModeToggle.addEventListener('click', () => this.toggleDarkMode());
        }
        this.applyDarkMode(this.isDarkModeEnabled());
    }
};