class SPAHandler {
  constructor() {
    this.contentElement = document.getElementById("dynamic-content");
    this.routes = {
      home: "_includes/pages/home.html",
      blog: "_includes/pages/blog.html",

      arts: "_includes/pages/arts.html",
      philosophy: "_includes/pages/philosophy.html",
      archives: "_includes/pages/archives.html",
      bio: "_includes/pages/bio-more.html",
    };
    this.defaultRoute = "home";
    this.errorPage = "_includes/pages/404.html";
    this.transitionDuration = 300;
    this.repoNavigator = null;
    this.currentRoute = null;
    this.lazyLoader = new LazyLoader();
    this.onRouteChange = null; // Add this line
  }

  init() {
    window.addEventListener("hashchange", () => this.handleRoute());
    this.handleRoute();
  }

  async handleRoute() {
    const hash = window.location.hash.slice(1);
    console.log(`[SPA] Handling route: ${hash}`);

    const [route, ...rest] = hash.split("/");
    const subPath = rest.join("/");

    if (route === "archives") {
      await this.handleArchivesRoute(subPath);
    } else {
      await this.loadDynamicContent(route || this.defaultRoute);
    }

    this.updateActiveMenuDot(route || this.defaultRoute);
    this.currentRoute = route || this.defaultRoute;

    // Add this line to call the onRouteChange callback
    if (this.onRouteChange) this.onRouteChange();
  }

  async handleArchivesRoute(subPath) {
    console.log(`[SPA] Handling archives route with subPath: ${subPath}`);

    if (!this.repoNavigator) {
      await this.loadDynamicContent("archives");
      await this.initRepoNavigator();
    }

    if (subPath) {
      await this.navigateRepoContent(subPath);
    } else if (this.repoNavigator) {
      await this.repoNavigator.fetchContents();
    }
  }

  async loadDynamicContent(route) {
    console.log(`[SPA] Loading content for route: ${route}`);
    const contentUrl = this.routes[route] || this.errorPage;

    try {
      await this.fadeOut();
      const html = await this.fetchContent(contentUrl);
      this.contentElement.innerHTML = html;
      this.updateCardParallax(route);
      this.initializeLazyLoading();
      await this.fadeIn();
      this.applyPageSpecificStyles(route);

      if (this.currentRoute === "archives" && route !== "archives") {
        this.cleanupRepoNavigator();
      }
    } catch (error) {
      console.error("Error loading content:", error);
      this.contentElement.innerHTML = `
        <div class="error-container" style="display: flex; justify-content: center; align-items: center; height: 90%; width: 100%;">
          <p class="error" style="text-align: center; margin: 0; padding: 20px; max-width: 80%;">
            This page is either under repair or does not exist
          </p>
        </div>`;
      this.contentElement.style.opacity = "1";
    }
  }

  initializeLazyLoading() {
    const lazyImages = this.contentElement.querySelectorAll("img[data-src]");
    lazyImages.forEach((img) => this.lazyLoader.observe(img));

    const lazyContents = this.contentElement.querySelectorAll(
      "[data-lazy-content]"
    );
    lazyContents.forEach((content) => this.lazyLoader.observe(content));
  }

  async initRepoNavigator() {
    console.log("[SPA] Initializing RepoNavigator");
    if (typeof RepoNavigator === "function") {
      this.repoNavigator = new RepoNavigator(this.lazyLoader);
      await this.repoNavigator.init();
    } else {
      console.error("RepoNavigator class not found");
    }
  }

  cleanupRepoNavigator() {
    console.log("[SPA] Cleaning up RepoNavigator");
    if (this.repoNavigator) {
      this.repoNavigator = null;
    }
  }

  async navigateRepoContent(subPath) {
    console.log(`[SPA] Navigating RepoNavigator to: ${subPath}`);
    if (this.repoNavigator) {
      if (subPath.endsWith(".md")) {
        await this.repoNavigator.handleNavigation();
      } else {
        await this.repoNavigator.navigateToFolder(subPath);
      }
    } else {
      console.error("RepoNavigator not initialized");
    }
  }

  fadeOut() {
    return new Promise((resolve) => {
      this.contentElement.style.opacity = "0";
      setTimeout(resolve, this.transitionDuration);
    });
  }

  fadeIn() {
    return new Promise((resolve) => {
      setTimeout(() => {
        this.contentElement.style.opacity = "1";
        resolve();
      }, 50);
    });
  }

  async fetchContent(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Content not found");
    }
    return response.text();
  }

  addMenuListeners() {
    document.querySelectorAll(".menu-icon").forEach((dot) => {
      dot.addEventListener("click", (event) => {
        event.preventDefault();
        const page = dot.getAttribute("data-title").toLowerCase();
        this.navigateToPage(page);
      });
    });
  }

  navigateToPage(page) {
    window.location.hash = page;
  }

  updateActiveMenuDot(route) {
    document.querySelectorAll(".menu-icon").forEach((dot) => {
      const dotPage = dot.getAttribute("data-title").toLowerCase();
      dot.classList.toggle("active", route === dotPage);
    });
  }

  updateCardParallax(route) {
    const isHomePage = route === "home";
    if (typeof CardParallax !== "undefined") {
      if (isHomePage) {
        CardParallax.enable();
      } else {
        CardParallax.disable();
      }
    }
  }

  applyPageSpecificStyles(route) {
    document.body.setAttribute("data-page", route);
    console.log(`[SPA] Applied page-specific attribute: data-page="${route}"`);
  }
}

// Initialize SPA handler
document.addEventListener("DOMContentLoaded", () => {
  console.log("[SPA] Initializing SPA Handler");
  window.spaHandler = new SPAHandler();
  window.spaHandler.init();
  window.spaHandler.addMenuListeners();
});
