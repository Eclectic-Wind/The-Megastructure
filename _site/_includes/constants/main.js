import { elements } from "./scripts/elements.js";
import { CardParallax } from "./scripts/cardParallax.js";
import { DarkMode } from "./scripts/darkMode.js";
import { DataAttributeHandler } from "./scripts/dataAttribute.js";

document.addEventListener("DOMContentLoaded", () => {
  const loadingScreen = document.getElementById("loading-screen");

  function getCurrentRoute() {
    const hash = window.location.hash.slice(1);
    const [route] = hash.split("/");
    return route || "home";
  }

  function syncParallaxToCurrentRoute() {
    const route = getCurrentRoute();
    if (route === "home") {
      CardParallax.enable();
      return;
    }

    CardParallax.disable();
  }

  try {
    CardParallax.init();
    syncParallaxToCurrentRoute();
  } catch (error) {
    console.error("[Main] CardParallax init failed:", error);
  }

  try {
    DarkMode.init();
  } catch (error) {
    console.error("[Main] DarkMode init failed:", error);
  }

  const dataAttributeHandler = new DataAttributeHandler();
  dataAttributeHandler.init();

  // Add this new code to interact with SPAHandler
  if (window.spaHandler) {
    window.spaHandler.onRouteChange = () => {
      dataAttributeHandler.hideAttribute();
    };
  }

  function hideLoadingScreen() {
    if (!loadingScreen) {
      return;
    }

    document.documentElement.classList.add("is-loaded");
    loadingScreen.style.opacity = "0";
    setTimeout(() => {
      loadingScreen.style.display = "none";
    }, 400);
  }

  // Hide the loading screen when the page is actually ready: first page
  // content rendered and the icon font loaded. The videos don't need to be
  // waited on because their poster frames show until they start playing.
  // Cap the wait so a slow CDN never holds the page hostage.
  const ready = Promise.all([
    window.spaHandler ? window.spaHandler.firstRouteReady : Promise.resolve(),
    document.fonts ? document.fonts.ready : Promise.resolve(),
  ]);

  Promise.race([ready, new Promise((resolve) => setTimeout(resolve, 3500))]).then(
    hideLoadingScreen
  );
});
