class RepoNavigator {
  constructor() {
    this.baseApiUrl =
      "https://api.github.com/repos/Eclectic-Wind/The-Megastructure-Archives/contents";
    this.container = document.getElementById("repo-navigator-container");
    this.currentPath = [];
    this.markedAvailable = typeof marked !== "undefined";
    this.breadcrumb = null;
    this.contentList = null;
    this.fileContent = null;
    this.searchBar = null;
    this.searchResults = null;
    this.currentContents = [];
    this.isSearching = false;
    this.searchAbortController = null;
    this.searchDebounceTimer = null;
    this.cachedResults = new Map();
    this.contentCache = new Map();
    this.fileCache = new Map();
    this.cacheMaxAge = 5 * 60 * 1000;
    this.ignoredFiles = [".gitattributes", ".gitignore", ".git"];
    this.baseUrl = "#archives/";
    this.transitionDuration = 150; // Duration of transition in milliseconds
  }

  init() {
    if (!this.container) {
      console.error("repo-navigator-container not found in the DOM");
      return;
    }
    this.createUI();
    window.addEventListener("popstate", this.handleNavigation.bind(this));
    window.addEventListener("hashchange", this.handleNavigation.bind(this));
    this.handleNavigation();
  }

  handleNavigation() {
    const hash = window.location.hash;
    if (!hash || hash === "#") {
      this.fetchContents();
    } else if (hash.startsWith(this.baseUrl)) {
      const path = hash.slice(this.baseUrl.length);
      if (path.endsWith(".md")) {
        this.loadFileFromUrl(path);
      } else {
        this.navigateToFolder(path);
      }
    } else {
      this.fetchContents();
    }
  }

  createUI() {
    this.container.innerHTML = `
      <div id="repo-breadcrumb"></div>
      <input type="text" id="repo-search" placeholder="Search through titles or tags...">
      <div id="repo-content-list"></div>
      <div id="search-results"></div>
      <div id="file-content" class="markdown-body"></div>
    `;
    this.breadcrumb = document.getElementById("repo-breadcrumb");
    this.contentList = document.getElementById("repo-content-list");
    this.fileContent = document.getElementById("file-content");
    this.searchBar = document.getElementById("repo-search");
    this.searchResults = document.getElementById("search-results");

    if (
      !this.breadcrumb ||
      !this.contentList ||
      !this.fileContent ||
      !this.searchBar ||
      !this.searchResults
    ) {
      throw new Error("Failed to create UI elements");
    }

    this.searchBar.addEventListener("input", () => this.handleAutoSearch());

    // Add transition styles
    const style = document.createElement("style");
    style.textContent = `
      #repo-content-list, #search-results, #file-content {
        transition: opacity ${this.transitionDuration}ms ease-in-out;
      }
      .fade-out {
        opacity: 0;
      }
      .fade-in {
        opacity: 1;
      }
    `;
    document.head.appendChild(style);
  }

  fetchContents(path = "") {
    const cacheKey = path || "root";
    const cachedContent = this.contentCache.get(cacheKey);

    if (
      cachedContent &&
      Date.now() - cachedContent.timestamp < this.cacheMaxAge
    ) {
      this.currentContents = cachedContent.data;
      this.displayContents(this.currentContents);
      return;
    }

    fetch(path ? `${this.baseApiUrl}/${path}` : this.baseApiUrl)
      .then((response) => {
        if (!response.ok)
          throw new Error(`HTTP error! status: ${response.status}`);
        return response.json();
      })
      .then((data) => {
        this.currentContents = data;
        this.contentCache.set(cacheKey, {
          data: this.currentContents,
          timestamp: Date.now(),
        });
        this.displayContents(this.currentContents);
      })
      .catch((error) => {
        console.error("Error fetching contents:", error);
        this.showError(
          "Error loading repository contents. Please try again later."
        );
      });
  }

  displayContents(contents) {
    this.fadeOut(this.contentList).then(() => {
      this.contentList.innerHTML = "";
      this.hideFileContent();
      this.hideSearchResults();
      contents
        .filter((item) => !this.shouldIgnoreFile(item.name))
        .forEach((item) => this.createContentItem(item));
      this.updateBreadcrumb();
      return this.fadeIn(this.contentList);
    });
  }

  shouldIgnoreFile(filename) {
    return this.ignoredFiles.includes(filename) || filename.startsWith(".git");
  }

  createContentItem(item) {
    const itemElement = document.createElement("div");
    itemElement.className = "repo-item";
    const icon =
      item.type === "dir"
        ? '<i class="fas fa-folder"></i>'
        : '<i class="fas fa-file"></i>';
    const truncatedName = this.truncateString(item.name, 30);

    itemElement.innerHTML = `${icon} <span class="${item.type}">${truncatedName}</span>`;

    if (item.type === "file") {
      this.fetchFileContent(item)
        .then((content) => {
          const frontmatter = this.extractFrontmatter(content);
          if (frontmatter && frontmatter.modified) {
            const formattedDate = this.formatDateShort(frontmatter.modified);
            const dateElement = document.createElement("span");
            dateElement.className = "modified-date";
            dateElement.textContent = formattedDate || frontmatter.modified;
            itemElement.appendChild(dateElement);
          }
          if (frontmatter) {
            this.addTagsToItem(itemElement, frontmatter);
          }
        })
        .catch((error) => {
          console.error("Error processing file content:", error);
          const errorElement = document.createElement("span");
          errorElement.className = "error-indicator";
          errorElement.textContent = "⚠️";
          itemElement.appendChild(errorElement);
        });
    }

    itemElement.addEventListener("click", () => {
      item.type === "dir"
        ? this.navigateToFolder(item.path)
        : this.showFileContent(item);
    });
    this.contentList.appendChild(itemElement);
  }

  addTagsToItem(element, frontmatter) {
    if (frontmatter && frontmatter.tags) {
      const tagsElement = document.createElement("span");
      tagsElement.className = "item-tags";
      tagsElement.textContent = frontmatter.tags.join(", ");
      element.setAttribute("title", `Tags: ${tagsElement.textContent}`);
    }
  }

  formatDateShort(dateString) {
    try {
      dateString = dateString.trim();
      const [datePart, timePart] = dateString.split("T");
      const [year, month, day] = datePart.split("-").map(Number);
      const date = new Date(Date.UTC(year, month - 1, day));
      if (isNaN(date.getTime())) {
        throw new Error("Invalid date");
      }
      return date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch (error) {
      console.error("Error formatting date:", dateString, error);
      return dateString;
    }
  }

  truncateString(str, num) {
    if (str.length <= num) {
      return str;
    }
    return str.slice(0, num) + "...";
  }

  showFileContent(file) {
    this.fadeOut(this.contentList)
      .then(() => this.fetchFileContent(file))
      .then((content) => {
        const frontmatter = this.extractFrontmatter(content);
        content = this.removeFrontmatter(content);
        this.hideNavigator();
        this.renderFileContent(file, content, frontmatter);
        this.updateUrl(file.path);
        return this.fadeIn(this.fileContent);
      })
      .catch((error) => {
        console.error("Error fetching file content:", error);
        this.showError("Error loading file content. Please try again later.");
      });
  }

  fetchFileContent(file) {
    const cacheKey = file.path;
    const cachedContent = this.fileCache.get(cacheKey);

    if (
      cachedContent &&
      Date.now() - cachedContent.timestamp < this.cacheMaxAge
    ) {
      return Promise.resolve(cachedContent.data);
    }

    return fetch(file.download_url)
      .then((response) => {
        if (!response.ok)
          throw new Error(`HTTP error! status: ${response.status}`);
        return response.text();
      })
      .then((content) => {
        if (content.startsWith("version https://git-lfs.github.com/spec/v1")) {
          return this.fetchLFSContent(file);
        }
        this.fileCache.set(cacheKey, {
          data: content,
          timestamp: Date.now(),
        });
        return content;
      });
  }

  fetchLFSContent(file) {
    const lfsUrl = `https://media.githubusercontent.com/media/Eclectic-Wind/The-Megastructure-Archives/main/${file.path}`;
    return fetch(lfsUrl).then((response) => {
      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
      return response.text();
    });
  }
  formatDateLong(dateString) {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        throw new Error("Invalid date");
      }
      return date.toLocaleString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZoneName: "short",
      });
    } catch (error) {
      console.error("Error formatting date:", dateString, error);
      return dateString;
    }
  }

  renderFileContent(file, content, frontmatter) {
    console.log("Rendering file content:", file.name);
    console.log("Frontmatter:", frontmatter);

    let frontmatterHtml = "";
    if (frontmatter) {
      console.log("Processing frontmatter");
      frontmatterHtml = '<div class="frontmatter-metadata">';
      if (frontmatter.tags && frontmatter.tags.length > 0) {
        console.log("Processing tags:", frontmatter.tags);
        const tagLinks = frontmatter.tags
          .map((tag) => `<a href="#" class="tag-link">${tag}</a>`)
          .join(", ");
        frontmatterHtml += `<p class="frontmatter-tags">Tags: ${tagLinks}</p>`;
      }
      if (frontmatter.created) {
        console.log("Processing created date:", frontmatter.created);
        const createdDate = this.formatDateLong(frontmatter.created);
        frontmatterHtml += `<p class="frontmatter-created">Created: ${createdDate}</p>`;
      }
      if (frontmatter.modified) {
        console.log("Processing modified date:", frontmatter.modified);
        const modifiedDate = this.formatDateLong(frontmatter.modified);
        frontmatterHtml += `<p class="frontmatter-modified">Modified: ${modifiedDate}</p>`;
      }
      for (const [key, value] of Object.entries(frontmatter)) {
        if (!["tags", "created", "modified", "title"].includes(key)) {
          console.log("Processing additional frontmatter:", key, value);
          frontmatterHtml += `<p class="frontmatter-${key}">${key}: ${value}</p>`;
        }
      }
      frontmatterHtml += "</div>";
    }

    console.log("Updating breadcrumb");
    this.updateBreadcrumb(file.name);

    let renderedContent;
    if (file.name.endsWith(".md") && this.markedAvailable) {
      console.log("Rendering markdown content");
      renderedContent = marked.parse(content);
    } else {
      console.log("Rendering plain text content");
      renderedContent = `<pre>${this.escapeHtml(content)}</pre>`;
    }

    console.log("Setting file content HTML");
    this.fileContent.innerHTML = `
      ${frontmatterHtml}
      <div class="file-content-body">
        ${renderedContent}
      </div>
    `;

    console.log("Displaying file content");
    this.fileContent.style.display = "block";

    console.log("Adding event listeners to tag links");
    this.fileContent.querySelectorAll(".tag-link").forEach((tagLink) => {
      tagLink.addEventListener("click", (e) => {
        e.preventDefault();
        const tagText = e.target.textContent;
        console.log("Tag clicked:", tagText);
        this.searchBar.value = tagText;
        this.handleAutoSearch();
      });
    });

    console.log("File content rendering complete");
  }

  extractFrontmatter(content) {
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
    const match = content.match(frontmatterRegex);
    if (match) {
      const frontmatterString = match[1];
      const frontmatter = {};
      frontmatterString.split("\n").forEach((line) => {
        const colonIndex = line.indexOf(":");
        if (colonIndex !== -1) {
          const key = line.slice(0, colonIndex).trim();
          const value = line.slice(colonIndex + 1).trim();
          if (key === "created" || key === "modified") {
            frontmatter[key] = value.replace(/^['"]|['"]$/g, "");
          } else if (key === "tags") {
            frontmatter[key] = value
              .replace(/[\[\]]/g, "")
              .split(",")
              .map((tag) => tag.trim());
          } else {
            frontmatter[key] = value;
          }
        }
      });
      return frontmatter;
    }
    return null;
  }

  removeFrontmatter(content) {
    return content.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, "");
  }

  escapeHtml(unsafe) {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  navigateToFolder(path) {
    // Immediately update the breadcrumb
    this.updateBreadcrumb(path);

    this.fadeOut(this.fileContent).then(() => {
      this.currentPath = path.split("/").filter(Boolean);
      this.hideFileContent();
      this.hideSearchResults();
      this.showNavigator();
      this.searchBar.value = "";
      this.updateUrl(path);

      // Now fetch the contents
      this.fetchContents(path).then(() => {
        // After fetching, fade in the content
        this.fadeIn(this.contentList);
      });
    });
  }

  updateBreadcrumb(path = null, currentFile = null) {
    this.breadcrumb.innerHTML = `<span class="breadcrumb-item" data-path=""><i class="fas fa-folder"></i> Archives</span>`;
    if (path) {
      const parts = path.split("/").filter(Boolean);
      let currentPath = "";
      parts.forEach((folder) => {
        currentPath += `/${folder}`;
        this.breadcrumb.innerHTML += ` / <span class="breadcrumb-item" data-path="${currentPath}">${folder}</span>`;
      });
    }
    if (currentFile) {
      this.breadcrumb.innerHTML += ` / <span class="breadcrumb-item current-file">${currentFile}</span>`;
    }
    this.addBreadcrumbListeners();
  }

  addBreadcrumbListeners() {
    this.breadcrumb.querySelectorAll(".breadcrumb-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        const path = e.target.getAttribute("data-path");
        if (path !== null) {
          // Immediately update breadcrumb
          this.updateBreadcrumb(path.slice(1));
          // Then navigate
          this.navigateToFolder(path.slice(1));
        } else {
          // Immediately update breadcrumb
          this.updateBreadcrumb();
          // Then navigate to root
          this.navigateToFolder("");
        }
      });
    });
  }

  hideNavigator() {
    this.searchBar.style.display = "none";
    this.contentList.style.display = "none";
    this.searchResults.style.display = "none";
  }

  showNavigator() {
    this.breadcrumb.style.display = "block";
    this.searchBar.style.display = "block";
    this.contentList.style.display = "block";
    this.hideFileContent();
  }

  hideFileContent() {
    this.fileContent.style.display = "none";
  }

  hideSearchResults() {
    this.searchResults.style.display = "none";
    this.contentList.style.display = "block";
  }

  showSearchResults() {
    this.searchResults.style.display = "block";
    this.contentList.style.display = "none";
    this.hideFileContent();
  }

  showError(message) {
    this.contentList.innerHTML = `<p class="error-message">${message}</p>`;
  }

  handleAutoSearch() {
    const searchTerm = this.searchBar.value.toLowerCase();

    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }

    if (this.searchAbortController) {
      this.searchAbortController.abort();
    }

    if (searchTerm.length < 3) {
      this.hideSearchResults();
      this.showNavigator();
      return;
    }

    this.searchDebounceTimer = setTimeout(() => {
      this.performAutoSearch(searchTerm);
    }, 300);
  }

  async performAutoSearch(searchTerm) {
    this.isSearching = true;
    this.searchResults.innerHTML = "Searching...";
    this.showSearchResults();

    this.searchAbortController = new AbortController();

    try {
      if (this.cachedResults.has(searchTerm)) {
        this.displaySearchResults(this.cachedResults.get(searchTerm));
        return;
      }

      const results = await this.performDeepSearch(
        "",
        searchTerm,
        this.searchAbortController.signal
      );

      this.cachedResults.set(searchTerm, results);

      if (!this.searchAbortController.signal.aborted) {
        this.displaySearchResults(results);
      }
    } catch (error) {
      if (error.name === "AbortError") {
        console.log("Search aborted");
      } else {
        console.error("Error during auto search:", error);
        this.showError("Error performing search. Please try again later.");
      }
    } finally {
      this.isSearching = false;
    }
  }

  async performDeepSearch(path, searchTerm, signal) {
    const results = [];
    const contents = await this.fetchContentsForSearch(path, signal);

    for (const item of contents) {
      if (signal.aborted) {
        throw new DOMException("Search aborted", "AbortError");
      }

      if (this.shouldIgnoreFile(item.name)) {
        continue;
      }

      if (item.type === "file") {
        const content = await this.fetchFileContent(item);
        const frontmatter = this.extractFrontmatter(content);
        if (
          item.name.toLowerCase().includes(searchTerm) ||
          (frontmatter &&
            frontmatter.tags &&
            frontmatter.tags.some((tag) =>
              tag.toLowerCase().includes(searchTerm)
            ))
        ) {
          results.push(item);
        }
      } else if (item.type === "dir") {
        results.push(item);
        const subResults = await this.performDeepSearch(
          item.path,
          searchTerm,
          signal
        );
        results.push(...subResults);
      }
    }

    return results;
  }

  async fetchContentsForSearch(path, signal) {
    const cacheKey = path || "root";
    const cachedContent = this.contentCache.get(cacheKey);

    if (
      cachedContent &&
      Date.now() - cachedContent.timestamp < this.cacheMaxAge
    ) {
      return cachedContent.data;
    }

    const url = path ? `${this.baseApiUrl}/${path}` : this.baseApiUrl;
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();

    this.contentCache.set(cacheKey, {
      data: data,
      timestamp: Date.now(),
    });

    return data;
  }

  displaySearchResults(results) {
    this.searchResults.innerHTML = "";
    if (results.length === 0) {
      this.searchResults.innerHTML = "No results found.";
      return;
    }

    const resultTree = this.buildResultTree(results);
    const resultList = this.renderResultTree(resultTree);
    this.searchResults.appendChild(resultList);
  }

  buildResultTree(results) {
    const tree = {};
    results.forEach((item) => {
      const parts = item.path.split("/");
      let currentPath = "";
      parts.forEach((part, index) => {
        currentPath += (index > 0 ? "/" : "") + part;
        if (index === parts.length - 1) {
          tree[currentPath] = item;
        } else if (!tree[currentPath]) {
          tree[currentPath] = { type: "directory", name: part, children: {} };
        }
      });
    });
    return tree;
  }

  renderResultTree(tree) {
    const rootUl = document.createElement("ul");
    rootUl.className = "search-result-tree";

    const sortedPaths = Object.keys(tree).sort();

    sortedPaths.forEach((path) => {
      const item = tree[path];
      const parts = path.split("/");
      const name = parts[parts.length - 1];
      const level = parts.length - 1;

      const li = document.createElement("li");
      li.className = "search-result-item";
      li.style.paddingLeft = `${level * 20}px`;

      if (item.type === "file") {
        const fileIcon = '<i class="fas fa-file"></i>';
        const truncatedName = this.truncateString(name, 20);
        li.innerHTML = `${fileIcon} <span class="file-name">${truncatedName}</span>`;
        li.addEventListener("click", () => this.showFileContent(item));
      } else {
        const folderIcon = '<i class="fas fa-folder"></i>';
        li.innerHTML = `${folderIcon} <span class="folder-name">${name}</span>`;
      }

      rootUl.appendChild(li);
    });

    return rootUl;
  }

  updateUrl(path) {
    const newUrl = this.baseUrl + path.replace(/^\//, "");
    if (window.location.hash !== newUrl) {
      window.location.hash = newUrl;
    }
  }

  loadFileFromUrl(path) {
    fetch(`${this.baseApiUrl}/${path}`)
      .then((response) => {
        if (!response.ok)
          throw new Error(`HTTP error! status: ${response.status}`);
        return response.json();
      })
      .then((file) => this.showFileContent(file))
      .catch((error) => {
        console.error("Error loading file from URL:", error);
        this.showError("Error loading file. Please try again later.");
      });
  }

  clearCache() {
    this.contentCache.clear();
    this.fileCache.clear();
    console.log("Cache cleared");
  }

  fadeOut(element) {
    return new Promise((resolve) => {
      element.classList.add("fade-out");
      element.classList.remove("fade-in");
      setTimeout(() => {
        element.style.display = "none";
        resolve();
      }, this.transitionDuration);
    });
  }

  fadeIn(element) {
    return new Promise((resolve) => {
      element.style.display = "block";
      // Force a reflow to ensure the display change takes effect
      void element.offsetWidth;
      element.classList.remove("fade-out");
      element.classList.add("fade-in");
      setTimeout(resolve, this.transitionDuration);
    });
  }
}
