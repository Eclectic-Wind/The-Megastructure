class LazyLoader {
  constructor(options = {}) {
    this.options = {
      root: null,
      rootMargin: "0px",
      threshold: 0.1,
      ...options,
    };
    this.observer = null;
    this.init();
  }

  init() {
    this.observer = new IntersectionObserver(
      this.handleIntersection.bind(this),
      this.options
    );
  }

  handleIntersection(entries, observer) {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const target = entry.target;
        const lazyAction = target.dataset.lazyAction;
        if (lazyAction && typeof this[lazyAction] === "function") {
          this[lazyAction](target);
        }
        observer.unobserve(target);
      }
    });
  }

  observe(element) {
    if (element && !element.hasAttribute("data-lazy-loaded")) {
      this.observer.observe(element);
    }
  }

  loadImage(element) {
    const src = element.dataset.src;
    if (src) {
      const img = new Image();
      img.onload = () => {
        element.src = src;
        element.removeAttribute("data-src");
        element.setAttribute("data-lazy-loaded", "true");
        this.fadeIn(element);
      };
      img.onerror = () => {
        console.error(`Failed to load image: ${src}`);
        element.setAttribute("data-lazy-loaded", "true");
      };
      img.src = src;
    }
  }

  loadContent(element) {
    const content = element.dataset.content;
    if (content) {
      element.innerHTML = content;
      element.removeAttribute("data-content");
      element.setAttribute("data-lazy-loaded", "true");
      this.fadeIn(element);
    }
  }

  loadBackgroundImage(element) {
    const src = element.dataset.backgroundSrc;
    if (src) {
      const img = new Image();
      img.onload = () => {
        element.style.backgroundImage = `url(${src})`;
        element.removeAttribute("data-background-src");
        element.setAttribute("data-lazy-loaded", "true");
        this.fadeIn(element);
      };
      img.onerror = () => {
        console.error(`Failed to load background image: ${src}`);
        element.setAttribute("data-lazy-loaded", "true");
      };
      img.src = src;
    }
  }

  loadIframe(element) {
    const src = element.dataset.src;
    if (src) {
      element.src = src;
      element.removeAttribute("data-src");
      element.setAttribute("data-lazy-loaded", "true");
      this.fadeIn(element);
    }
  }

  loadFileContent(element) {
    if (typeof this.fetchFileContent === "function") {
      const itemData = element.dataset.item;
      if (itemData) {
        const item = JSON.parse(itemData);
        this.fetchFileContent(item)
          .then((content) => {
            this.processFileContent(element, content);
            element.setAttribute("data-lazy-loaded", "true");
            this.fadeIn(element);
          })
          .catch((error) => {
            console.error("Error processing file content:", error);
            this.showErrorIndicator(element);
            element.setAttribute("data-lazy-loaded", "true");
          });
      }
    } else {
      console.error("fetchFileContent method not implemented");
    }
  }

  processFileContent(element, content) {
    // This method should be overridden in the RepoNavigator class
    console.warn("processFileContent method not implemented");
  }

  showErrorIndicator(element) {
    const errorElement = document.createElement("span");
    errorElement.className = "error-indicator";
    errorElement.textContent = "⚠️";
    element.appendChild(errorElement);
  }

  fadeIn(element) {
    element.style.transition = "opacity 0.5s ease-in";
    element.style.opacity = "1";
  }

  // Helper method to set fetchFileContent
  setFetchFileContent(fetchFunction) {
    this.fetchFileContent = fetchFunction;
  }

  // Helper method to set processFileContent
  setProcessFileContent(processFunction) {
    this.processFileContent = processFunction;
  }
}
