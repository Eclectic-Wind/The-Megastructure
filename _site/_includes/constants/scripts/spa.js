class SPAHandler {
    constructor() {
        this.contentElement = document.getElementById("dynamic-content");
        this.routes = {
            home: "_includes/pages/home.html",
            arts: "_includes/pages/arts.html",
            philosophy: "_includes/pages/philosophy.html",
            writing: "_includes/pages/writing.html",
            archives: "_includes/pages/archives.html",
            bio: "_includes/pages/bio-more.html",
        };
        this.defaultRoute = "home";
        this.errorPage = "_includes/pages/404.html";
        this.transitionDuration = 300; // ms
        this.repoNavigator = null;
        this.currentRoute = null;
    }

    init() {
        window.addEventListener("hashchange", () => this.handleRoute());
        this.handleRoute(); // Call this immediately to handle the initial route
    }

    async handleRoute() {
        const hash = window.location.hash.slice(1); // Remove the leading '#'
        console.log(`[SPA] Handling route: ${hash}`); // Debug log
    
        const [route, ...rest] = hash.split('/');
        const subPath = rest.join('/');
    
        if (route === 'archives') {
            await this.handleArchivesRoute(subPath);
        } else {
            await this.loadDynamicContent(route || this.defaultRoute);
        }
    
        this.updateActiveMenuDot(route || this.defaultRoute);
        this.currentRoute = route || this.defaultRoute;
    }
    
    async handleArchivesRoute(subPath) {
        console.log(`[SPA] Handling archives route with subPath: ${subPath}`);
        await this.loadDynamicContent('archives');
        await this.initRepoNavigator();
        if (subPath) {
            await this.navigateRepoContent(subPath);
        } else {
            await this.repoNavigator.fetchContents(); // Load initial content if no subPath
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
            await this.fadeIn();
            this.applyPageSpecificStyles(route);

            // If we're navigating away from archives, clean up RepoNavigator
            if (this.currentRoute === 'archives' && route !== 'archives') {
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

    async initRepoNavigator() {
        console.log('[SPA] Initializing RepoNavigator');
        if (typeof RepoNavigator === 'function') {
            // Always create a new instance of RepoNavigator
            this.repoNavigator = new RepoNavigator();
            await this.repoNavigator.init();
        } else {
            console.error('RepoNavigator class not found');
        }
    }

    cleanupRepoNavigator() {
        console.log('[SPA] Cleaning up RepoNavigator');
        if (this.repoNavigator) {
            // Perform any necessary cleanup
            this.repoNavigator = null;
        }
    }

    async navigateRepoContent(subPath) {
        console.log(`[SPA] Navigating RepoNavigator to: ${subPath}`);
        if (this.repoNavigator) {
            if (subPath.endsWith('.md')) {
                await this.repoNavigator.loadFileFromUrl(subPath);
            } else {
                await this.repoNavigator.navigateToFolder(subPath);
            }
        } else {
            console.error('RepoNavigator not initialized');
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

// Initialize the SPA handler
document.addEventListener("DOMContentLoaded", () => {
    console.log("[SPA] Initializing SPA Handler");
    const spaHandler = new SPAHandler();
    spaHandler.init();
    spaHandler.addMenuListeners(); // Make sure menu listeners are added
});