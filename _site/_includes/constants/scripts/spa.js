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
      "bio-mind": "_includes/pages/bio-mind.html",
    };
    this.defaultRoute = "home";
    this.errorPage = "_includes/pages/404.html";
    this.transitionDuration = 180;
    this.repoNavigator = null;
    this.blogNavigator = null;
    this.currentRoute = null;
    this.lazyLoader = new LazyLoader();
    this.onRouteChange = null;
    this.navigatorDependenciesLoaded = false;
    this.navigatorScripts = {
      marked: "https://cdn.jsdelivr.net/npm/marked/marked.min.js",
      markdownUtils: "_includes/constants/scripts/markdownUtils.js",
      navigator: "_includes/constants/scripts/repoNavigator.js",
      blogNavigator: "_includes/constants/scripts/blogNavigator.js",
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
        () => {
          // Remove the failed tag so a later call retries instead of waiting
          // forever on a load event that will never fire.
          script.remove();
          reject(new Error(`Failed to load script: ${src}`));
        },
        { once: true }
      );

      document.body.appendChild(script);
    });
  }

  async ensureNavigatorDependenciesLoaded() {
    if (this.navigatorDependenciesLoaded) {
      return;
    }

    const scriptsToLoad = [];

    if (typeof marked === "undefined") {
      scriptsToLoad.push(this.loadScript(this.navigatorScripts.marked));
    }

    if (typeof MarkdownUtils === "undefined") {
      scriptsToLoad.push(this.loadScript(this.navigatorScripts.markdownUtils));
    }

    if (typeof RepoNavigator === "undefined") {
      scriptsToLoad.push(this.loadScript(this.navigatorScripts.navigator));
    }

    if (typeof BlogNavigator === "undefined") {
      scriptsToLoad.push(this.loadScript(this.navigatorScripts.blogNavigator));
    }

    // A failed load (e.g. the marked CDN being unreachable) shouldn't take the
    // whole page down: the navigators fall back to plain-text rendering.
    const results = await Promise.allSettled(scriptsToLoad);
    results
      .filter((result) => result.status === "rejected")
      .forEach((result) => console.error("[SPA]", result.reason));

    this.navigatorDependenciesLoaded =
      typeof marked !== "undefined" &&
      typeof MarkdownUtils !== "undefined" &&
      typeof RepoNavigator !== "undefined" &&
      typeof BlogNavigator !== "undefined";
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
    const anchorId = subPath; // The part after the first slash could be an anchor

    if (route === "archives") {
      await this.handleArchivesRoute(subPath);
    } else if (route === "blog") {
      await this.handleBlogRoute(subPath);
    } else {
      // Load page content if it's a different route
      if (route !== this.currentRoute) {
        await this.loadDynamicContent(route || this.defaultRoute);
      } else {
        // Same route, just scroll to anchor if provided
        if (subPath) {
          this.scrollToAnchor(subPath);
        }
      }
    }

    this.updateActiveMenuDot(route || this.defaultRoute);
    this.currentRoute = route || this.defaultRoute;

    // Scroll to anchor after content is loaded (archive/blog sub-paths are
    // file paths handled by their navigators, not in-page anchors)
    if (subPath && route !== "archives" && route !== "blog") {
      setTimeout(() => this.scrollToAnchor(anchorId), 50);
    }

    if (this.onRouteChange) this.onRouteChange();
  }

  async handleArchivesRoute(subPath) {
    console.log(`[SPA] Handling archives route with subPath: ${subPath}`);

    // Once initialized, RepoNavigator listens to hashchange itself and
    // resolves the current hash during init, so delegating here as well
    // would duplicate every GitHub API request.
    if (!this.repoNavigator) {
      await this.loadDynamicContent("archives");
      await this.initRepoNavigator();
    }
  }

  async handleBlogRoute(subPath) {
    console.log(`[SPA] Handling blog route with subPath: ${subPath}`);

    // Same as archives: BlogNavigator owns sub-path routing after init.
    if (!this.blogNavigator) {
      await this.loadDynamicContent("blog");
      await this.initBlogNavigator();
    }
  }

  async loadDynamicContent(route) {
    console.log(`[SPA] Loading content for route: ${route}`);
    const contentUrl = this.routes[route] || this.errorPage;

    // Tear down navigators before swapping content so a failed load can't
    // leave a stale navigator (and its hashchange listener) behind.
    if (route !== "archives") {
      this.cleanupRepoNavigator();
    }

    if (route !== "blog") {
      this.cleanupBlogNavigator();
    }

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

    await this.ensureNavigatorDependenciesLoaded();

    if (typeof RepoNavigator === "function") {
      this.repoNavigator = new RepoNavigator(this.lazyLoader);
      try {
        await this.repoNavigator.init();
      } catch (error) {
        console.error("[SPA] RepoNavigator init failed:", error);
        this.repoNavigator = null;
      }
    } else {
      console.error("RepoNavigator class not found");
    }
  }

  async initBlogNavigator() {
    console.log("[SPA] Initializing BlogNavigator");

    await this.ensureNavigatorDependenciesLoaded();

    if (typeof BlogNavigator === "function") {
      this.blogNavigator = new BlogNavigator();
      try {
        await this.blogNavigator.init();
      } catch (error) {
        console.error("[SPA] BlogNavigator init failed:", error);
        this.blogNavigator = null;
      }
    } else {
      console.error("BlogNavigator class not found");
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

  cleanupBlogNavigator() {
    console.log("[SPA] Cleaning up BlogNavigator");
    if (this.blogNavigator) {
      if (typeof this.blogNavigator.destroy === "function") {
        this.blogNavigator.destroy();
      }
      this.blogNavigator = null;
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

  scrollToAnchor(anchorId) {
    const element = document.getElementById(anchorId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
      console.log(`[SPA] Scrolled to anchor: ${anchorId}`);
    } else {
      console.warn(`[SPA] Anchor not found: ${anchorId}`);
    }
  }
}

// Initialize SPA handler
document.addEventListener("DOMContentLoaded", () => {
  console.log("[SPA] Initializing SPA Handler");
  window.spaHandler = new SPAHandler();
  window.spaHandler.init();
  window.spaHandler.addMenuListeners();
});
