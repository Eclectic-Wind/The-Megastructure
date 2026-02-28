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

    loadingScreen.style.opacity = "0";
    setTimeout(() => {
      loadingScreen.style.display = "none";
    }, 500);
  }

  function waitForWindowLoad() {
    if (document.readyState === "complete") {
      return Promise.resolve();
    }

    return new Promise((resolve) =>
      window.addEventListener("load", resolve, { once: true })
    );
  }

  function asyncOperations() {
    return new Promise((resolve) => {
      resolve();
    });
  }

  Promise.race([
    Promise.all([waitForWindowLoad(), asyncOperations()]),
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ]).then(() => {
    hideLoadingScreen();
  });
});
