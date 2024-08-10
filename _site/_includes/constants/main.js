import { elements } from './scripts/elements.js';
import { CardParallax } from './scripts/cardParallax.js';
import { DarkMode } from './scripts/darkMode.js';
import { DataAttributeHandler } from './scripts/dataAttribute.js';

document.addEventListener('DOMContentLoaded', () => {
    const loadingScreen = document.getElementById('loading-screen');

    // Initialize your components
    CardParallax.init();
    DarkMode.init();

    const dataAttributeHandler = new DataAttributeHandler();
    dataAttributeHandler.init();

    // Function to hide the loading screen
    function hideLoadingScreen() {
        loadingScreen.style.opacity = '0';
        setTimeout(() => {
            loadingScreen.style.display = 'none';
        }, 500); // Wait for fade out animation to complete
    }

    // Create a promise for any asynchronous operations you might have
    function asyncOperations() {
        return new Promise((resolve) => {
            // If you have any async operations, put them here
            resolve();
        });
    }

    // Wait for both the window load event and any async operations
    Promise.all([
        new Promise(resolve => window.addEventListener('load', resolve)),
        asyncOperations()
    ]).then(() => {
        // Everything has loaded, hide the loading screen
        hideLoadingScreen();
    });
});