class RepoNavigator {
  constructor() {
    this.repo = "Eclectic-Wind/The-Megastructure-Archives";
    this.branch = "main";
    this.baseApiUrl = `https://api.github.com/repos/${this.repo}/contents`;
    this.container = document.getElementById("repo-navigator-container");
    this.baseUrl = "#archives/";
    this.transitionDuration = 150;
    this.cacheMaxAge = 5 * 60 * 1000;
    this.ignoredFiles = [".gitattributes", ".gitignore", ".git"];
    this.minSearchLength = 2;
    this.searchConcurrency = 4;
    this.maxMetadataConcurrent = 2;

    this.extensions = {
      image: ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"],
      pdf: ["pdf"],
      text: [
        "md", "markdown", "txt", "json", "csv", "tsv", "yml", "yaml", "toml",
        "xml", "html", "css", "js", "ts", "py", "lua", "sh", "ini", "log",
      ],
    };
    this.mimeTypes = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      svg: "image/svg+xml",
      avif: "image/avif",
      pdf: "application/pdf",
    };

    this.breadcrumb = null;
    this.contentList = null;
    this.fileContent = null;
    this.searchBar = null;
    this.searchResults = null;
    this.transitionStyleElement = null;

    this.currentPath = [];
    this.currentViewPath = null;
    this.navigationToken = 0;
    this.objectUrl = null;

    this.contentCache = new Map(); // dir path -> listing
    this.fileCache = new Map(); // file path -> text
    this.knownFiles = new Map(); // file path -> file metadata from listings
    this.itemMetadataCache = new Map();
    this.treeCache = null;
    this.searchCache = new Map();

    this.searchAbortController = null;
    this.searchDebounceTimer = null;
    this.metadataQueue = [];
    this.activeMetadataRequests = 0;

    this.isInitialized = false;
    this.handleNavigationBound = this.handleNavigation.bind(this);
    this.handleAutoSearchBound = this.handleAutoSearch.bind(this);
  }

  init() {
    if (this.isInitialized) {
      return;
    }

    if (!this.container) {
      console.error("repo-navigator-container not found in the DOM");
      return;
    }

    this.createUI();
    window.addEventListener("hashchange", this.handleNavigationBound);
    this.isInitialized = true;
    this.handleNavigation();
  }

  destroy() {
    if (!this.isInitialized) {
      return;
    }

    window.removeEventListener("hashchange", this.handleNavigationBound);

    if (this.searchBar) {
      this.searchBar.removeEventListener("input", this.handleAutoSearchBound);
    }

    this.cancelSearch();

    if (this.transitionStyleElement) {
      this.transitionStyleElement.remove();
      this.transitionStyleElement = null;
    }

    this.releaseObjectUrl();
    this.metadataQueue = [];
    this.activeMetadataRequests = 0;
    this.isInitialized = false;
  }

  // ---------------------------------------------------------------- UI setup

  createUI() {
    this.container.innerHTML = `
      <div id="repo-breadcrumb"></div>
      <input type="text" id="repo-search" placeholder="Search by name, title, text or tag..." aria-label="Search the archives">
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

    this.searchBar.addEventListener("input", this.handleAutoSearchBound);

    this.transitionStyleElement = document.createElement("style");
    this.transitionStyleElement.textContent = `
      #repo-content-list, #search-results, #file-content {
        transition: opacity ${this.transitionDuration}ms ease-in-out;
      }
      .fade-out { opacity: 0; }
      .fade-in { opacity: 1; }
      #file-content .file-embed {
        width: 100%;
        height: 70vh;
        border: 0;
        border-radius: 8px;
      }
      #file-content .file-image {
        display: block;
        max-width: 100%;
        height: auto;
        margin: 0 auto;
        border-radius: 8px;
      }
      #file-content .file-actions { margin: 0 0 1rem; }
    `;
    document.head.appendChild(this.transitionStyleElement);
  }

  // -------------------------------------------------------------- navigation

  // The hash is the single source of truth: clicks only update the hash, and
  // this handler renders whatever it points at.
  handleNavigation() {
    const hash = window.location.hash;

    if (hash === "#archives") {
      this.openPath("");
    } else if (hash.startsWith(this.baseUrl)) {
      this.openPath(MarkdownUtils.safeDecode(hash.slice(this.baseUrl.length)));
    }
    // Any other hash belongs to a different route; the SPA tears this
    // navigator down, so don't fire an API request for it.
  }

  navigateTo(path) {
    const normalized = this.normalizePath(path);
    const target = normalized ? this.baseUrl + this.encodePath(normalized) : "#archives";

    if (MarkdownUtils.safeDecode(window.location.hash) === MarkdownUtils.safeDecode(target)) {
      // Same hash won't fire hashchange (e.g. clicking the current folder
      // while search results are shown), so render directly.
      this.currentViewPath = null;
      this.openPath(normalized);
    } else {
      window.location.hash = target;
    }
  }

  async openPath(rawPath) {
    const path = this.normalizePath(rawPath);
    if (path === this.currentViewPath) {
      return;
    }

    this.currentViewPath = path;
    const token = ++this.navigationToken;
    const scrollContainer = document.getElementById("dynamic-content");
    if (scrollContainer) {
      scrollContainer.scrollTop = 0;
    }
    this.cancelSearch();
    this.searchBar.value = "";

    try {
      const knownFile = this.knownFiles.get(path);
      if (knownFile) {
        await this.showFileContent(knownFile, token);
        return;
      }

      // First load: placeholder rows instead of an empty box.
      if (!this.contentList.hasChildNodes() && !this.contentCache.has(path)) {
        this.contentList.innerHTML = Array.from(
          { length: 4 },
          () => '<div class="repo-item repo-skeleton" aria-hidden="true"><span class="skeleton-line"></span></div>'
        ).join("");
      }

      // Folder listings and file metadata come from the same endpoint, so a
      // single request tells us which one a deep-linked path is.
      const data = await this.fetchPathData(path);
      if (token !== this.navigationToken) {
        return;
      }

      if (Array.isArray(data)) {
        await this.showFolder(path, data, token);
      } else if (data && data.type === "file") {
        this.knownFiles.set(data.path, data);
        await this.showFileContent(data, token);
      } else {
        throw new Error(`Unsupported item at ${path}`);
      }
    } catch (error) {
      if (token !== this.navigationToken) {
        return;
      }

      console.error("Error opening archive path:", error);
      this.currentViewPath = null;
      this.showError("Error loading this part of the archives. Please try again later.");
    }
  }

  fetchPathData(path) {
    const cached = this.contentCache.get(path);
    if (cached && Date.now() - cached.timestamp < this.cacheMaxAge) {
      return Promise.resolve(cached.data);
    }

    const url = path ? `${this.baseApiUrl}/${this.encodePath(path)}` : this.baseApiUrl;

    return this.fetchJson(url).then((data) => {
      if (Array.isArray(data)) {
        this.contentCache.set(path, { data, timestamp: Date.now() });
      }
      return data;
    });
  }

  // Kept for callers that still expect the old API.
  fetchContents(path = "") {
    return this.openPath(path);
  }

  // ----------------------------------------------------------------- folders

  async showFolder(path, contents, token) {
    this.currentPath = path ? path.split("/") : [];
    this.updateBreadcrumb(path);

    await Promise.all([this.fadeOut(this.contentList), this.fadeOut(this.fileContent)]);
    if (token !== this.navigationToken) {
      return;
    }

    this.releaseObjectUrl();
    this.fileContent.innerHTML = "";
    this.hideSearchResults();
    this.showNavigator();
    this.contentList.innerHTML = "";
    this.metadataQueue = [];

    const visibleItems = contents
      .filter((item) => !this.shouldIgnoreFile(item.name))
      .sort((left, right) => {
        if (left.type !== right.type) {
          return left.type === "dir" ? -1 : 1;
        }
        return left.name.localeCompare(right.name, undefined, { numeric: true });
      });

    if (visibleItems.length === 0) {
      this.contentList.innerHTML = '<p class="error-message">This folder is empty.</p>';
    }

    visibleItems.forEach((item) => {
      if (item.type === "file") {
        this.knownFiles.set(item.path, item);
      }
      this.createContentItem(item);
    });

    await this.fadeIn(this.contentList);
  }

  shouldIgnoreFile(filename) {
    return this.ignoredFiles.includes(filename) || filename.startsWith(".git");
  }

  createContentItem(item) {
    const itemElement = document.createElement("div");
    const isDir = item.type === "dir";
    itemElement.className = `repo-item repo-item--${isDir ? "dir" : "file"}`;
    itemElement.tabIndex = 0;
    itemElement.setAttribute("role", "link");
    itemElement.title = item.name;

    const icon = isDir ? "fa-folder" : this.getFileIcon(item.name);
    itemElement.innerHTML = `
      <i class="fas ${icon} repo-item-icon" aria-hidden="true"></i>
      <span class="repo-item-name ${isDir ? "dir" : "file"}">${MarkdownUtils.escapeHtml(item.name)}</span>
      <span class="repo-item-meta"></span>`;

    const open = () => this.navigateTo(item.path);
    itemElement.addEventListener("click", open);
    itemElement.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });

    this.contentList.appendChild(itemElement);
    this.enqueueMetadataLoad(item, itemElement);
  }

  getFileIcon(name) {
    const kind = this.getFileKind(name);
    if (kind === "image") return "fa-file-image";
    if (kind === "pdf") return "fa-file-pdf";
    if (kind === "markdown" || kind === "text") return "fa-file-lines";
    return "fa-file";
  }

  // ---------------------------------------------------------- item metadata

  enqueueMetadataLoad(item, itemElement) {
    // Only markdown files carry frontmatter; never download binaries just to
    // decorate the listing.
    if (item.type === "file" && this.getFileKind(item.name) !== "markdown") {
      return;
    }

    this.metadataQueue.push({ item, itemElement });
    this.processMetadataQueue();
  }

  processMetadataQueue() {
    if (!this.isInitialized) {
      return;
    }

    while (
      this.activeMetadataRequests < this.maxMetadataConcurrent &&
      this.metadataQueue.length > 0
    ) {
      const task = this.metadataQueue.shift();
      this.activeMetadataRequests += 1;

      this.loadItemMetadata(task.item, task.itemElement).finally(() => {
        this.activeMetadataRequests -= 1;
        this.processMetadataQueue();
      });
    }
  }

  async loadItemMetadata(item, itemElement) {
    try {
      if (!this.isInitialized || !itemElement.isConnected) {
        return;
      }

      if (item.type === "file") {
        const content = await this.fetchFileContent(item);
        if (!this.isInitialized || !itemElement.isConnected) {
          return;
        }

        const frontmatter = MarkdownUtils.extractFrontmatter(content);
        const modified = frontmatter && (frontmatter.modified || frontmatter.updated);
        if (modified) {
          this.appendModifiedDate(itemElement, MarkdownUtils.formatDateShort(modified));
        }

        if (frontmatter && frontmatter.tags && frontmatter.tags.length > 0) {
          itemElement.title = `${item.name}\nTags: ${frontmatter.tags.join(", ")}`;
        }
      } else if (item.type === "dir") {
        const modifiedDate = await this.fetchPathLastModified(item.path);
        if (modifiedDate && this.isInitialized && itemElement.isConnected) {
          this.appendModifiedDate(itemElement, MarkdownUtils.formatDateShort(modifiedDate));
        }
      }
    } catch (error) {
      if (!this.isInitialized || !itemElement.isConnected) {
        return;
      }

      console.error("Error loading item metadata:", error);
      const errorElement = document.createElement("span");
      errorElement.className = "error-indicator";
      errorElement.textContent = "⚠️";
      (itemElement.querySelector(".repo-item-meta") || itemElement).appendChild(errorElement);
    }
  }

  appendModifiedDate(itemElement, dateText) {
    const dateElement = document.createElement("span");
    dateElement.className = "modified-date";
    dateElement.textContent = dateText;
    (itemElement.querySelector(".repo-item-meta") || itemElement).appendChild(dateElement);
  }

  async fetchPathLastModified(path) {
    const cacheKey = `meta:${path}`;
    const cached = this.itemMetadataCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheMaxAge) {
      return cached.modified;
    }

    const commits = await this.fetchJson(
      `https://api.github.com/repos/${this.repo}/commits?path=${encodeURIComponent(path)}&per_page=1`
    );
    const modified = commits?.[0]?.commit?.committer?.date || null;
    this.itemMetadataCache.set(cacheKey, { modified, timestamp: Date.now() });
    return modified;
  }

  // ------------------------------------------------------------------- files

  getExtension(name) {
    const match = String(name).toLowerCase().match(/\.([a-z0-9]+)$/);
    return match ? match[1] : "";
  }

  getFileKind(name) {
    const extension = this.getExtension(name);
    if (extension === "md" || extension === "markdown") return "markdown";
    if (this.extensions.image.includes(extension)) return "image";
    if (this.extensions.pdf.includes(extension)) return "pdf";
    if (!extension || this.extensions.text.includes(extension)) return "text";
    return "binary";
  }

  rawUrl(path) {
    return `https://raw.githubusercontent.com/${this.repo}/${this.branch}/${this.encodePath(path)}`;
  }

  lfsUrl(path) {
    return `https://media.githubusercontent.com/media/${this.repo}/${this.branch}/${this.encodePath(path)}`;
  }

  githubUrl(file) {
    return file.html_url || `https://github.com/${this.repo}/blob/${this.branch}/${this.encodePath(file.path)}`;
  }

  encodePath(path) {
    return path.split("/").map(encodeURIComponent).join("/");
  }

  isLfsPointer(text) {
    return text.startsWith("version https://git-lfs.github.com/spec/v1");
  }

  async showFileContent(file, token = this.navigationToken) {
    const pathParts = file.path.split("/").filter(Boolean);
    this.currentPath = pathParts.slice(0, -1);
    this.updateBreadcrumb(this.currentPath.join("/"), file.name);

    await Promise.all([
      this.fadeOut(this.contentList),
      this.fadeOut(this.searchResults),
      this.fadeOut(this.fileContent),
    ]);
    if (token !== this.navigationToken) {
      return;
    }

    const kind = this.getFileKind(file.name);
    let html;

    if (kind === "markdown" || kind === "text") {
      const content = await this.fetchFileContent(file);
      if (token !== this.navigationToken) {
        return;
      }
      html = this.renderTextFile(file, content, kind);
    } else if (kind === "image" || kind === "pdf") {
      const url = await this.fetchBinaryUrl(file);
      if (token !== this.navigationToken) {
        URL.revokeObjectURL(url);
        return;
      }
      this.releaseObjectUrl();
      this.objectUrl = url;
      html = this.renderBinaryFile(file, kind, url);
    } else {
      html = `
        ${this.renderFileHeader(file.name, null, this.renderFileActions(file))}
        <p class="blog-empty-state">No preview available for this file type.</p>`;
    }

    this.hideNavigator();
    this.fileContent.innerHTML = html;
    this.bindTagLinks();
    await this.fadeIn(this.fileContent);
  }

  renderTextFile(file, rawContent, kind) {
    const isMarkdown = kind === "markdown";
    const frontmatter = isMarkdown ? MarkdownUtils.extractFrontmatter(rawContent) : null;
    let content = isMarkdown ? MarkdownUtils.removeFrontmatter(rawContent) : rawContent;

    // Title: frontmatter title, else the note's leading `# Heading` (which is
    // then dropped from the body so it isn't shown twice), else the file name.
    let title = file.name.replace(/\.(md|markdown)$/i, "");
    if (isMarkdown) {
      const heading = (content.match(/^\s*#\s+(.+?)\s*#*\s*(?:\r?\n|$)/) || [])[1];
      const fmTitle = MarkdownUtils.normalizeText(frontmatter && frontmatter.title);
      if (heading && (!fmTitle || MarkdownUtils.toPlainText(heading).toLowerCase() === fmTitle.toLowerCase())) {
        content = content.replace(/^\s*#\s+.+?(?:\r?\n|$)/, "");
      }
      title = fmTitle || (heading ? MarkdownUtils.toPlainText(heading) : title);
    }

    const body = isMarkdown
      ? MarkdownUtils.renderMarkdown(content, {
          rawBaseUrl: `https://raw.githubusercontent.com/${this.repo}/${this.branch}/`,
          dirPath: this.currentPath.join("/"),
          linkForPath: (path) => this.baseUrl + this.encodePath(path),
        })
      : `<pre>${MarkdownUtils.escapeHtml(content)}</pre>`;

    return `
      ${this.renderFileHeader(title, frontmatter)}
      <article class="file-content-body">${body}</article>
    `;
  }

  renderFileHeader(title, frontmatter, extraHtml = "") {
    return `
      <header class="blog-post-header note-header">
        <h2 class="blog-post-heading">${MarkdownUtils.escapeHtml(title)}</h2>
        ${this.renderFrontmatter(frontmatter)}
        ${extraHtml}
      </header>`;
  }

  renderBinaryFile(file, kind, url) {
    const name = MarkdownUtils.escapeHtml(file.name);
    const preview =
      kind === "image"
        ? `<img class="file-image" src="${url}" alt="${name}">`
        : `<iframe class="file-embed" src="${url}" title="${name}"></iframe>`;

    return `
      ${this.renderFileHeader(file.name, null, this.renderFileActions(file, url))}
      <div class="file-content-body">${preview}</div>
    `;
  }

  renderFileActions(file, downloadUrl = null) {
    const name = MarkdownUtils.escapeHtml(file.name);
    const download = downloadUrl
      ? `<a class="file-action" href="${downloadUrl}" download="${name}"><i class="fas fa-download" aria-hidden="true"></i> Download</a>`
      : "";

    return `<p class="file-actions">${download}<a class="file-action" href="${MarkdownUtils.escapeHtml(
      this.githubUrl(file)
    )}" target="_blank" rel="noopener"><i class="fab fa-github" aria-hidden="true"></i> View on GitHub</a></p>`;
  }

  renderFrontmatter(frontmatter) {
    if (!frontmatter) {
      return "";
    }

    const escape = (value) => MarkdownUtils.escapeHtml(value);
    let html = "";

    const tags = (frontmatter.tags || []).filter(Boolean);
    if (tags.length > 0) {
      html += `<p class="frontmatter-tags">${tags
        .map(
          (tag) =>
            `<button type="button" class="blog-tag-link tag-link" data-tag="${escape(tag)}" aria-label="Search for ${escape(tag)}">${escape(tag)}</button>`
        )
        .join(" ")}</p>`;
    }

    const dates = [];
    const created = frontmatter.created || frontmatter.published || frontmatter.date;
    if (!MarkdownUtils.isMissingDate(created)) {
      dates.push(`Created ${MarkdownUtils.formatDateLong(created)}`);
    }
    const modified = frontmatter.modified || frontmatter.updated;
    if (!MarkdownUtils.isMissingDate(modified)) {
      dates.push(`Modified ${MarkdownUtils.formatDateLong(modified)}`);
    }
    if (dates.length > 0) {
      html += `<p class="note-dates">${escape(dates.join(" · "))}</p>`;
    }

    // Any other properties (status, author, ...) as a compact list.
    const shownKeys = ["tags", "aliases", "title", "created", "published", "date", "modified", "updated", "cssclasses"];
    const properties = Object.entries(frontmatter).filter(
      ([key, value]) => !shownKeys.includes(key) && value !== "" && !(Array.isArray(value) && value.length === 0)
    );
    if (properties.length > 0) {
      html += `<dl class="note-properties">${properties
        .map(
          ([key, value]) =>
            `<div><dt>${escape(key)}</dt><dd>${escape(Array.isArray(value) ? value.join(", ") : value)}</dd></div>`
        )
        .join("")}</dl>`;
    }

    return html ? `<div class="frontmatter-metadata">${html}</div>` : "";
  }

  bindTagLinks() {
    this.fileContent.querySelectorAll(".tag-link").forEach((tagLink) => {
      tagLink.addEventListener("click", (event) => {
        event.preventDefault();
        this.searchBar.style.display = "block";
        this.searchBar.value = tagLink.getAttribute("data-tag") || tagLink.textContent;
        this.handleAutoSearch();
      });
    });
  }

  fetchFileContent(file) {
    const cached = this.fileCache.get(file.path);
    if (cached && Date.now() - cached.timestamp < this.cacheMaxAge) {
      return Promise.resolve(cached.data);
    }

    return this.fetchText(file.download_url || this.rawUrl(file.path))
      .then((content) => (this.isLfsPointer(content) ? this.fetchText(this.lfsUrl(file.path)) : content))
      .then((content) => {
        this.fileCache.set(file.path, { data: content, timestamp: Date.now() });
        return content;
      });
  }

  // raw.githubusercontent.com serves files as octet-stream with nosniff, so
  // browsers won't display them inline. Re-wrap the bytes with the right
  // MIME type and hand back an object URL instead.
  async fetchBinaryUrl(file) {
    let blob = await this.fetchBlob(file.download_url || this.rawUrl(file.path));

    if (blob.size < 1024 && this.isLfsPointer(await blob.text())) {
      blob = await this.fetchBlob(this.lfsUrl(file.path));
    }

    const type = this.mimeTypes[this.getExtension(file.name)] || blob.type;
    return URL.createObjectURL(new Blob([blob], { type }));
  }

  releaseObjectUrl() {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  // ------------------------------------------------------------- breadcrumb

  updateBreadcrumb(path = null, currentFile = null) {
    const resolvedPath = this.normalizePath(path === null ? this.currentPath.join("/") : path);
    const escape = (value) => MarkdownUtils.escapeHtml(value);
    const separator = '<span class="breadcrumb-sep" aria-hidden="true">/</span>';
    const parts = resolvedPath.split("/").filter(Boolean);
    const link = (label, target, isCurrent) =>
      isCurrent
        ? `<span class="breadcrumb-item current" aria-current="page">${label}</span>`
        : `<a class="breadcrumb-item" href="${target ? this.baseUrl + this.encodePath(target) : "#archives"}" data-path="${escape(target)}">${label}</a>`;

    const crumbs = [link('<i class="fas fa-box-archive" aria-hidden="true"></i> Archives', "", !parts.length && !currentFile)];
    parts.forEach((folder, index) => {
      const target = parts.slice(0, index + 1).join("/");
      crumbs.push(link(escape(folder), target, index === parts.length - 1 && !currentFile));
    });
    if (currentFile) {
      crumbs.push(link(escape(currentFile), null, true));
    }

    this.breadcrumb.setAttribute("role", "navigation");
    this.breadcrumb.setAttribute("aria-label", "Breadcrumb");
    this.breadcrumb.innerHTML = crumbs.join(separator);
    this.breadcrumb.querySelectorAll("a.breadcrumb-item").forEach((item) => {
      item.addEventListener("click", (event) => {
        event.preventDefault();
        this.navigateTo(item.getAttribute("data-path"));
      });
    });
  }

  // ----------------------------------------------------------------- search

  handleAutoSearch() {
    const searchTerm = this.searchBar.value.trim().toLowerCase();
    this.cancelSearch();

    if (searchTerm.length < this.minSearchLength) {
      this.hideSearchResults();
      // Restore whatever view the hash points at (folder or file).
      if (this.fileContent.innerHTML.trim()) {
        this.searchBar.style.display = "none";
        this.contentList.style.display = "none";
        this.fileContent.style.display = "block";
      }
      return;
    }

    this.searchDebounceTimer = setTimeout(() => this.performAutoSearch(searchTerm), 300);
  }

  cancelSearch() {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }

    if (this.searchAbortController) {
      this.searchAbortController.abort();
      this.searchAbortController = null;
    }
  }

  async performAutoSearch(searchTerm) {
    const controller = new AbortController();
    this.searchAbortController = controller;
    this.searchResults.innerHTML = Array.from(
      { length: 3 },
      () => '<div class="repo-item repo-skeleton" aria-hidden="true"><span class="skeleton-line"></span></div>'
    ).join("");
    this.searchResults.setAttribute("aria-busy", "true");
    this.showSearchResults();

    try {
      let results = this.searchCache.get(searchTerm);
      if (!results) {
        results = await this.searchRepository(searchTerm, controller.signal);
        this.searchCache.set(searchTerm, results);
      }

      if (!controller.signal.aborted) {
        this.displaySearchResults(results);
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error("Error during search:", error);
        this.searchResults.textContent = "Error performing search. Please try again later.";
      }
    }
  }

  // One request for the whole tree (instead of one per folder); markdown
  // files are then checked for matching tags, a few at a time.
  async searchRepository(searchTerm, signal) {
    const entries = await this.fetchTree(signal);
    const matches = [];
    const queue = [];

    entries.forEach((entry) => {
      if (entry.name.toLowerCase().includes(searchTerm)) {
        matches.push(entry);
      } else if (entry.type === "file" && this.getFileKind(entry.name) === "markdown") {
        queue.push(entry);
      }
    });

    const worker = async () => {
      while (queue.length > 0) {
        if (signal.aborted) {
          throw new DOMException("Search aborted", "AbortError");
        }

        const entry = queue.shift();
        try {
          const content = await this.fetchFileContent(entry);
          const frontmatter = MarkdownUtils.extractFrontmatter(content) || {};
          const fields = [
            frontmatter.title || "",
            (frontmatter.tags || []).join(" "),
            MarkdownUtils.toPlainText(MarkdownUtils.removeFrontmatter(content)),
          ].map((field) => MarkdownUtils.normalizeForSearch(field));
          if (MarkdownUtils.matchesQuery(fields, searchTerm)) {
            matches.push(entry);
          }
        } catch (error) {
          console.warn(`Skipping ${entry.path} in search:`, error);
        }
      }
    };

    await Promise.all(Array.from({ length: this.searchConcurrency }, worker));
    if (signal.aborted) {
      throw new DOMException("Search aborted", "AbortError");
    }

    return matches;
  }

  async fetchTree(signal) {
    if (this.treeCache && Date.now() - this.treeCache.timestamp < this.cacheMaxAge) {
      return this.treeCache.data;
    }

    const data = await this.fetchJson(
      `https://api.github.com/repos/${this.repo}/git/trees/${this.branch}?recursive=1`,
      { signal }
    );

    const entries = (data.tree || [])
      .filter((entry) => entry.type === "blob" || entry.type === "tree")
      .filter((entry) => !entry.path.split("/").some((part) => this.shouldIgnoreFile(part)))
      .map((entry) => {
        const name = entry.path.split("/").pop();
        if (entry.type === "tree") {
          return { type: "dir", name, path: entry.path };
        }

        return (
          this.knownFiles.get(entry.path) || {
            type: "file",
            name,
            path: entry.path,
            download_url: this.rawUrl(entry.path),
          }
        );
      });

    this.treeCache = { data: entries, timestamp: Date.now() };
    return entries;
  }

  displaySearchResults(results) {
    this.searchResults.removeAttribute("aria-busy");
    this.searchResults.innerHTML = "";
    if (results.length === 0) {
      this.searchResults.innerHTML = `<p class="blog-empty-state">No results for “${MarkdownUtils.escapeHtml(
        this.searchBar.value.trim()
      )}”.</p>`;
      return;
    }

    const summary = document.createElement("p");
    summary.className = "blog-search-summary";
    summary.textContent = `${results.length} ${results.length === 1 ? "result" : "results"}`;
    this.searchResults.appendChild(summary);

    // Flat list: folders first, then files, each with the folder it lives in.
    const sorted = [...results].sort((left, right) => {
      if (left.type !== right.type) {
        return left.type === "dir" ? -1 : 1;
      }
      return left.path.localeCompare(right.path, undefined, { numeric: true });
    });

    const list = document.createElement("ul");
    list.className = "search-result-list";

    sorted.forEach((item, index) => {
      const isDir = item.type === "dir";
      const folder = item.path.split("/").slice(0, -1).join(" / ") || "Archives";
      const li = document.createElement("li");
      li.className = `repo-item search-result-item repo-item--${isDir ? "dir" : "file"}`;
      li.tabIndex = 0;
      li.setAttribute("role", "link");
      li.title = item.path;
      li.style.setProperty("--enter-index", Math.min(index, 10));
      li.innerHTML = `
        <i class="fas ${isDir ? "fa-folder" : this.getFileIcon(item.name)} repo-item-icon" aria-hidden="true"></i>
        <span class="repo-item-name">${MarkdownUtils.escapeHtml(item.name)}</span>
        <span class="repo-item-meta search-result-path">${MarkdownUtils.escapeHtml(folder)}</span>`;

      const open = () => {
        if (!isDir) {
          this.knownFiles.set(item.path, item);
        }
        this.navigateTo(item.path);
      };
      li.addEventListener("click", open);
      li.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      });
      list.appendChild(li);
    });

    this.searchResults.appendChild(list);
  }

  // ------------------------------------------------------------ view state

  hideNavigator() {
    this.searchBar.style.display = "none";
    this.contentList.style.display = "none";
    this.searchResults.style.display = "none";
  }

  showNavigator() {
    this.breadcrumb.style.display = "block";
    this.searchBar.style.display = "block";
    this.contentList.style.display = "block";
    this.fileContent.style.display = "none";
  }

  hideSearchResults() {
    this.searchResults.style.display = "none";
    this.contentList.style.display = "block";
  }

  showSearchResults() {
    this.searchResults.style.display = "block";
    this.searchResults.classList.remove("fade-out");
    this.contentList.style.display = "none";
    this.fileContent.style.display = "none";
  }

  showError(message) {
    this.showNavigator();
    this.contentList.innerHTML = `<p class="error-message">${MarkdownUtils.escapeHtml(message)}</p>`;
    this.contentList.classList.remove("fade-out");
    this.contentList.classList.add("fade-in");
  }

  fadeOut(element) {
    if (element.style.display === "none") {
      return Promise.resolve();
    }

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
      void element.offsetWidth; // force reflow so the transition runs
      element.classList.remove("fade-out");
      element.classList.add("fade-in");
      setTimeout(resolve, this.transitionDuration);
    });
  }

  // ---------------------------------------------------------------- helpers

  normalizePath(path) {
    return String(path || "").replace(/^\/+|\/+$/g, "");
  }

  async fetchJson(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  async fetchText(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.text();
  }

  async fetchBlob(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.blob();
  }
}

window.RepoNavigator = RepoNavigator;
