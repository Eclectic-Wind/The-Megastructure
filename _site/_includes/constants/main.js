import { elements } from "./scripts/elements.js";
import { CardParallax } from "./scripts/cardParallax.js";
import { DarkMode } from "./scripts/darkMode.js";
import { DataAttributeHandler } from "./scripts/dataAttribute.js";

document.addEventListener("DOMContentLoaded", () => {
  const loadingScreen = document.getElementById("loading-screen");

  CardParallax.init();
  DarkMode.init();

  const dataAttributeHandler = new DataAttributeHandler();
  dataAttributeHandler.init();

  function hideLoadingScreen() {
    loadingScreen.style.opacity = "0";
    setTimeout(() => {
      loadingScreen.style.display = "none";
    }, 500);
  }

  function asyncOperations() {
    return new Promise((resolve) => {
      resolve();
    });
  }

  Promise.all([
    new Promise((resolve) => window.addEventListener("load", resolve)),
    asyncOperations(),
  ]).then(() => {
    hideLoadingScreen();
  });
});
