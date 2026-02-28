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
    this.transitionDuration = 180;
    this.repoNavigator = null;
    this.currentRoute = null;
    this.lazyLoader = new LazyLoader();
    this.onRouteChange = null;
    this.archivesDependenciesLoaded = false;
    this.archivesScripts = {
      marked: "https://cdn.jsdelivr.net/npm/marked/marked.min.js",
      navigator: "_includes/constants/scripts/repoNavigator.js",
    };
  }

  loadScript(src) {
    return new Promise((resolve, reject) => {
      const existingScript = document.querySelector(`script[src="${src}"]`);

      if (existingScript) {
        if (existingScript.dataset.loaded === "true") {
          resolve();
          return;
        }

        existingScript.addEventListener("load", () => resolve(), { once: true });
        existingScript.addEventListener(
          "error",
          () => reject(new Error(`Failed to load script: ${src}`)),
          { once: true }
        );
        return;
      }

      const script = document.createElement("script");
      script.src = src;
      script.defer = true;

      script.addEventListener(
        "load",
        () => {
          script.dataset.loaded = "true";
          resolve();
        },
        { once: true }
      );
      script.addEventListener(
        "error",
        () => reject(new Error(`Failed to load script: ${src}`)),
        { once: true }
      );

      document.body.appendChild(script);
    });
  }

  async ensureArchivesDependenciesLoaded() {
    if (this.archivesDependenciesLoaded) {
      return;
    }

    const scriptsToLoad = [];

    if (typeof marked === "undefined") {
      scriptsToLoad.push(this.loadScript(this.archivesScripts.marked));
    }

    if (typeof RepoNavigator === "undefined") {
      scriptsToLoad.push(this.loadScript(this.archivesScripts.navigator));
    }

    if (scriptsToLoad.length > 0) {
      await Promise.all(scriptsToLoad);
    }

    this.archivesDependenciesLoaded =
      typeof marked !== "undefined" && typeof RepoNavigator !== "undefined";
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
      this.updateCardParallax(route);
      this.applyPageSpecificStyles(route);

      const htmlPromise = this.fetchContent(contentUrl);
      await this.fadeOut();

      const html = await htmlPromise;
      this.contentElement.innerHTML = html;
      await this.executeEmbeddedScripts(this.contentElement);
      this.initializeLazyLoading();
      await this.fadeIn();

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

  async executeEmbeddedScripts(container) {
    const scripts = Array.from(container.querySelectorAll("script"));

    for (const oldScript of scripts) {
      const newScript = document.createElement("script");

      Array.from(oldScript.attributes).forEach((attribute) => {
        newScript.setAttribute(attribute.name, attribute.value);
      });

      if (!oldScript.src) {
        newScript.textContent = oldScript.textContent;
      }

      const scriptReady = new Promise((resolve) => {
        if (!oldScript.src) {
          resolve();
          return;
        }

        newScript.addEventListener("load", resolve, { once: true });
        newScript.addEventListener(
          "error",
          () => {
            console.error(`[SPA] Failed to load script: ${oldScript.src}`);
            resolve();
          },
          { once: true }
        );
      });

      oldScript.parentNode.replaceChild(newScript, oldScript);
      await scriptReady;
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

    await this.ensureArchivesDependenciesLoaded();

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
      if (typeof this.repoNavigator.destroy === "function") {
        this.repoNavigator.destroy();
      }
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
    if (!this.contentElement) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const done = () => {
        this.contentElement.removeEventListener("transitionend", onTransitionEnd);
        resolve();
      };

      const onTransitionEnd = (event) => {
        if (event.target === this.contentElement && event.propertyName === "opacity") {
          done();
        }
      };

      this.contentElement.addEventListener("transitionend", onTransitionEnd);
      this.contentElement.style.opacity = "0";
      setTimeout(done, this.transitionDuration + 40);
    });
  }

  fadeIn() {
    if (!this.contentElement) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        this.contentElement.style.opacity = "1";
        resolve();
      });
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
    const cardParallax = window.CardParallax;

    if (cardParallax) {
      if (isHomePage) {
        cardParallax.enable();
      } else {
        cardParallax.disable();
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
