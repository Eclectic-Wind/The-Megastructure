class BlogNavigator {
  constructor() {
    this.repo = "Eclectic-Wind/The-Megastructure-Archives";
    this.branch = "main";
    this.blogDir = "blog";
    this.baseApiUrl = `https://api.github.com/repos/${this.repo}/contents/${this.blogDir}`;
    this.rawBaseUrl = `https://raw.githubusercontent.com/${this.repo}/${this.branch}/`;
    this.siteTitle = "kam's megastructure.";
    this.container = document.getElementById("blog-navigator-container");
    this.scrollContainer = document.getElementById("dynamic-content");

    this.searchBar = null;
    this.listContainer = null;
    this.fileContent = null;

    this.posts = [];
    this.filteredPosts = [];
    this.currentPage = 1;
    this.itemsPerPage = 5;
    this.listScrollTop = 0;

    this.fileCache = new Map();
    this.cacheMaxAge = 5 * 60 * 1000;
    this.searchDebounceTimer = null;

    this.isInitialized = false;
    this.isDestroyed = false;
    this.loadError = null;
    this.currentPostPath = null;
    this.openToken = 0;
    this.handleHashChangeBound = this.handleHashChange.bind(this);
  }

  // --------------------------------------------------------------- lifecycle

  async init() {
    if (this.isInitialized) {
      return;
    }

    if (!this.container) {
      console.error("blog-navigator-container not found in the DOM");
      return;
    }

    this.renderBaseUi();
    this.showStatus("Loading posts…");

    try {
      await this.loadPosts();
    } catch (error) {
      console.error("Error loading blog posts:", error);
      this.loadError = error;
    }

    // The reader may have left the blog while posts were loading.
    if (this.isDestroyed) {
      return;
    }

    window.addEventListener("hashchange", this.handleHashChangeBound);
    this.isInitialized = true;
    this.handleHashChange();
  }

  destroy() {
    this.isDestroyed = true;
    this.openToken += 1;
    window.removeEventListener("hashchange", this.handleHashChangeBound);

    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }

    this.isInitialized = false;
  }

  renderBaseUi() {
    this.container.innerHTML = `
      <input type="search" id="blog-search" placeholder="Search through titles, excerpts, or tags..." aria-label="Search blog posts">
      <div id="blog-content-list" aria-live="polite"></div>
      <div id="blog-file-content" class="markdown-body"></div>
    `;

    this.searchBar = document.getElementById("blog-search");
    this.listContainer = document.getElementById("blog-content-list");
    this.fileContent = document.getElementById("blog-file-content");

    if (!this.searchBar || !this.listContainer || !this.fileContent) {
      throw new Error("Failed to create blog UI elements");
    }

    this.fileContent.style.display = "none";

    this.searchBar.addEventListener("input", () => {
      if (this.searchDebounceTimer) {
        clearTimeout(this.searchDebounceTimer);
      }

      this.searchDebounceTimer = setTimeout(() => {
        this.currentPage = 1;
        this.applySearch(this.searchBar.value);
      }, 200);
    });
  }

  // -------------------------------------------------------------- routing

  async handleHashChange() {
    const hash = window.location.hash || "";
    const baseHash = "#blog";

    if (hash !== baseHash && !hash.startsWith(`${baseHash}/`)) {
      return;
    }

    const path = hash.slice(baseHash.length).replace(/^\/+/, "");
    if (!path) {
      this.showListView();
      return;
    }

    await this.openPostByPath(path);
  }

  hashForPath(repoPath) {
    const relative = repoPath.startsWith(`${this.blogDir}/`)
      ? repoPath.slice(this.blogDir.length + 1)
      : repoPath;
    return `#blog/${MarkdownUtils.encodeRepoPath(relative)}`;
  }

  // Links inside posts: other blog posts stay in the blog, anything else in
  // the repository opens in the archives.
  linkForPath(repoPath) {
    return repoPath.startsWith(`${this.blogDir}/`)
      ? this.hashForPath(repoPath)
      : `#archives/${MarkdownUtils.encodeRepoPath(repoPath)}`;
  }

  // ---------------------------------------------------------------- loading

  isMarkdownFile(item) {
    return item.type === "file" && /\.(md|markdown)$/i.test(item.name);
  }

  async loadPosts() {
    const response = await fetch(this.baseApiUrl);
    if (!response.ok) {
      const error = new Error(`HTTP error! status: ${response.status}`);
      error.status = response.status;
      throw error;
    }

    const data = await response.json();
    const markdownFiles = (Array.isArray(data) ? data : []).filter((item) =>
      this.isMarkdownFile(item)
    );

    const loadedPosts = await Promise.all(
      markdownFiles.map(async (file) => {
        try {
          return this.buildPost(file, await this.fetchFileContent(file));
        } catch (error) {
          console.error(`Error loading blog post ${file.path}:`, error);
          return null;
        }
      })
    );

    // Newest first; posts sharing a date fall back to alphabetical order.
    this.posts = loadedPosts.filter(Boolean).sort((left, right) => {
      if (left.sortTime !== right.sortTime) {
        return right.sortTime - left.sortTime;
      }
      return left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
    });
    this.filteredPosts = [...this.posts];
  }

  buildPost(file, content) {
    const frontmatter = MarkdownUtils.extractFrontmatter(content) || {};
    const body = MarkdownUtils.removeFrontmatter(content);
    const { published, updated } = this.getPostDates(frontmatter);

    return {
      file,
      title: this.getPostTitle(frontmatter, body, file),
      excerpt: this.extractFirstParagraph(body),
      tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
      published,
      updated,
      sortTime: MarkdownUtils.parseDateToMillis(updated || published),
    };
  }

  // Frontmatter title, else the document's leading `# Heading`, else the
  // file name.
  getPostTitle(frontmatter, body, file) {
    const fromFrontmatter = MarkdownUtils.normalizeText(frontmatter.title);
    if (fromFrontmatter) {
      return fromFrontmatter;
    }

    const heading = this.getLeadingHeading(body);
    if (heading) {
      return MarkdownUtils.toPlainText(heading);
    }

    return file.name.replace(/\.(md|markdown)$/i, "");
  }

  getLeadingHeading(body) {
    const match = String(body).match(/^\s*#\s+(.+?)\s*#*\s*(?:\r?\n|$)/);
    return match ? match[1] : "";
  }

  fetchFileContent(file) {
    const cached = this.fileCache.get(file.path);
    if (cached && Date.now() - cached.timestamp < this.cacheMaxAge) {
      return Promise.resolve(cached.data);
    }

    const url = file.download_url || this.rawBaseUrl + MarkdownUtils.encodeRepoPath(file.path);
    return this.fetchText(url)
      .then((content) =>
        content.startsWith("version https://git-lfs.github.com/spec/v1")
          ? this.fetchText(
              `https://media.githubusercontent.com/media/${this.repo}/${this.branch}/${MarkdownUtils.encodeRepoPath(file.path)}`
            )
          : content
      )
      .then((content) => {
        this.fileCache.set(file.path, { data: content, timestamp: Date.now() });
        return content;
      });
  }

  async fetchText(url) {
    const response = await fetch(url);
    if (!response.ok) {
      const error = new Error(`HTTP error! status: ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return response.text();
  }

  // ------------------------------------------------------------- list view

  applySearch(rawTerm) {
    const searchTerm = (rawTerm || "").trim().toLowerCase();

    if (!searchTerm) {
      this.filteredPosts = [...this.posts];
    } else {
      this.filteredPosts = this.posts.filter(
        (post) =>
          post.title.toLowerCase().includes(searchTerm) ||
          post.excerpt.toLowerCase().includes(searchTerm) ||
          post.tags.some((tag) => String(tag).toLowerCase().includes(searchTerm))
      );
    }

    this.renderListPage();
  }

  showStatus(message, { action = null } = {}) {
    this.fileContent.style.display = "none";
    this.listContainer.style.display = "block";
    this.listContainer.innerHTML = `<p class="blog-empty-state">${MarkdownUtils.escapeHtml(message)}</p>`;

    if (action) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "blog-page-button blog-empty-action";
      button.textContent = action.label;
      button.addEventListener("click", action.onClick);
      this.listContainer.querySelector(".blog-empty-state").appendChild(button);
    }
  }

  loadErrorMessage() {
    if (this.loadError && (this.loadError.status === 403 || this.loadError.status === 429)) {
      return "GitHub is limiting requests right now. Please try again in a few minutes.";
    }
    return "Unable to load blog posts right now. Please try again later.";
  }

  renderListPage() {
    this.fileContent.style.display = "none";
    this.listContainer.style.display = "block";

    if (this.loadError) {
      this.showStatus(this.loadErrorMessage());
      return;
    }

    if (this.posts.length === 0) {
      this.showStatus("No posts yet.");
      return;
    }

    if (this.filteredPosts.length === 0) {
      this.showStatus(`No posts match “${this.searchBar.value.trim()}”.`, {
        action: { label: "Clear search", onClick: () => this.clearSearch() },
      });
      return;
    }

    const totalPages = Math.max(1, Math.ceil(this.filteredPosts.length / this.itemsPerPage));
    this.currentPage = Math.min(Math.max(this.currentPage, 1), totalPages);

    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const pageItems = this.filteredPosts.slice(startIndex, startIndex + this.itemsPerPage);

    this.listContainer.innerHTML = "";
    pageItems.forEach((post) => this.listContainer.appendChild(this.createPostCard(post)));

    if (totalPages > 1) {
      this.listContainer.appendChild(this.createPaginationControls(totalPages));
    }
  }

  createPostCard(post) {
    const card = document.createElement("article");
    card.className = "blog-post-card";
    card.tabIndex = 0;
    card.setAttribute("role", "link");
    card.setAttribute("aria-label", post.title);

    const tagsHtml = this.renderTagChips(post.tags, "blog-post-tag");
    const metaLine = this.buildMetaLine(post);
    card.innerHTML = `
      <h3 class="blog-post-title">${MarkdownUtils.escapeHtml(post.title)}</h3>
      <p class="blog-post-excerpt">${MarkdownUtils.escapeHtml(post.excerpt)}</p>
      ${tagsHtml ? `<div class="blog-post-tags">${tagsHtml}</div>` : ""}
      ${metaLine ? `<p class="blog-post-meta">${metaLine}</p>` : ""}
    `;

    const open = () => this.navigateToPost(post.file);
    card.addEventListener("click", open);
    card.addEventListener("keydown", (event) => {
      if (event.target === card && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        open();
      }
    });

    card.querySelectorAll(".blog-post-tag").forEach((tagButton) => {
      tagButton.addEventListener("click", (event) => {
        event.stopPropagation();
        this.searchByTag(tagButton.getAttribute("data-tag") || "");
      });
    });

    return card;
  }

  createPaginationControls(totalPages) {
    const controls = document.createElement("nav");
    controls.className = "blog-pagination";
    controls.setAttribute("aria-label", "Blog pages");

    const makeButton = (label, disabled, delta) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "blog-page-button";
      button.textContent = label;
      button.disabled = disabled;
      button.addEventListener("click", () => {
        this.currentPage += delta;
        this.renderListPage();
        this.setScrollTop(0);
      });
      return button;
    };

    const indicator = document.createElement("span");
    indicator.className = "blog-page-indicator";
    indicator.textContent = `Page ${this.currentPage} of ${totalPages}`;

    controls.appendChild(makeButton("Previous", this.currentPage <= 1, -1));
    controls.appendChild(indicator);
    controls.appendChild(makeButton("Next", this.currentPage >= totalPages, 1));
    return controls;
  }

  showListView() {
    const wasReadingPost = this.fileContent.style.display !== "none";
    this.openToken += 1; // cancel any post still loading
    this.currentPostPath = null;
    this.searchBar.style.display = "";
    this.renderListPage();
    document.title = `Blog — ${this.siteTitle}`;

    // Coming back from a post: return to where the reader was in the list.
    if (wasReadingPost) {
      this.setScrollTop(this.listScrollTop);
    }
  }

  clearSearch() {
    this.searchBar.value = "";
    this.currentPage = 1;
    this.applySearch("");
    this.searchBar.focus();
  }

  searchByTag(tagValue) {
    const normalizedTag = String(tagValue || "").trim();
    if (!normalizedTag) {
      return;
    }

    this.currentPage = 1;
    this.listScrollTop = 0;
    this.searchBar.value = normalizedTag;
    this.applySearch(normalizedTag);
  }

  // ------------------------------------------------------------- post view

  navigateToPost(file) {
    if (this.listContainer.style.display !== "none" && this.scrollContainer) {
      this.listScrollTop = this.scrollContainer.scrollTop;
    }
    // The hashchange handler opens the post.
    window.location.hash = this.hashForPath(file.path);
  }

  async openPostByPath(relativePath) {
    const decodedPath = MarkdownUtils.safeDecode(relativePath);
    const fullPath = decodedPath.startsWith(`${this.blogDir}/`)
      ? decodedPath
      : `${this.blogDir}/${decodedPath}`;

    if (this.currentPostPath === fullPath && this.fileContent.style.display !== "none") {
      return;
    }

    const token = ++this.openToken;

    // Posts listed in the index already carry their file metadata, so only
    // fall back to the (rate-limited) contents API for unlisted paths.
    let file = this.posts.find((post) => post.file.path === fullPath)?.file;

    try {
      if (!file) {
        const response = await fetch(
          `https://api.github.com/repos/${this.repo}/contents/${MarkdownUtils.encodeRepoPath(fullPath)}`
        );
        if (!response.ok) {
          const error = new Error(`HTTP error! status: ${response.status}`);
          error.status = response.status;
          throw error;
        }
        file = await response.json();
        if (!file || file.type !== "file") {
          const error = new Error("Not a file");
          error.status = 404;
          throw error;
        }
      }

      const content = await this.fetchFileContent(file);
      if (token !== this.openToken) {
        return; // a newer navigation won
      }

      this.renderPost(file, content);
    } catch (error) {
      if (token !== this.openToken) {
        return;
      }

      console.error("Error opening blog post:", error);
      this.showPostError(
        error.status === 404
          ? "This post doesn’t exist (it may have been moved or renamed)."
          : error.status === 403 || error.status === 429
            ? "GitHub is limiting requests right now. Please try again in a few minutes."
            : "Unable to load this post right now. Please try again later."
      );
    }
  }

  renderPost(file, content) {
    const frontmatter = MarkdownUtils.extractFrontmatter(content);
    let body = MarkdownUtils.removeFrontmatter(content);
    const title = this.getPostTitle(frontmatter || {}, body, file);

    // Don't repeat the title when the document opens with the same heading.
    const heading = this.getLeadingHeading(body);
    if (heading && MarkdownUtils.toPlainText(heading).toLowerCase() === title.toLowerCase()) {
      body = body.replace(/^\s*#\s+.+?(?:\r?\n|$)/, "");
    }

    const dirPath = file.path.split("/").slice(0, -1).join("/");
    const renderedContent = body.trim()
      ? MarkdownUtils.renderMarkdown(body, {
          rawBaseUrl: this.rawBaseUrl,
          dirPath,
          linkForPath: (path) => this.linkForPath(path),
        })
      : '<p class="blog-empty-state">This post is empty.</p>';

    this.currentPostPath = file.path;
    this.listContainer.style.display = "none";
    this.searchBar.style.display = "none";
    this.fileContent.style.display = "block";
    this.fileContent.innerHTML = `
      <header class="blog-post-header">
        ${this.backButtonHtml()}
        <h2 class="blog-post-heading">${MarkdownUtils.escapeHtml(title)}</h2>
        ${this.renderFrontmatter(frontmatter)}
      </header>
      <article class="file-content-body">${renderedContent}</article>
    `;
    this.bindBackButton();
    this.setScrollTop(0);
    document.title = `${title} — ${this.siteTitle}`;

    this.fileContent.querySelectorAll(".blog-tag-link").forEach((tagLink) => {
      tagLink.addEventListener("click", (event) => {
        event.preventDefault();
        this.searchByTag(tagLink.getAttribute("data-tag") || "");
        window.location.hash = "#blog";
      });
    });
  }

  showPostError(message) {
    this.currentPostPath = null;
    this.listContainer.style.display = "none";
    this.searchBar.style.display = "none";
    this.fileContent.style.display = "block";
    this.fileContent.innerHTML = `
      <header class="blog-post-header">${this.backButtonHtml()}</header>
      <p class="blog-empty-state">${MarkdownUtils.escapeHtml(message)}</p>
    `;
    this.bindBackButton();
    document.title = `Blog — ${this.siteTitle}`;
  }

  backButtonHtml() {
    return `<button class="blog-back-button" type="button">
      <i class="fas fa-arrow-left" aria-hidden="true"></i> Back to blog
    </button>`;
  }

  bindBackButton() {
    const backButton = this.fileContent.querySelector(".blog-back-button");
    if (backButton) {
      // The hashchange handler renders the list view.
      backButton.addEventListener("click", () => {
        window.location.hash = "#blog";
      });
    }
  }

  renderFrontmatter(frontmatter) {
    if (!frontmatter) {
      return "";
    }

    const { published, updated } = this.getPostDates(frontmatter);
    const tags = Array.isArray(frontmatter.tags) ? frontmatter.tags : [];
    let html = "";

    if (tags.length > 0) {
      html += `<p class="frontmatter-tags">Tags: ${this.renderTagChips(tags, "blog-tag-link")}</p>`;
    }

    if (!MarkdownUtils.isMissingDate(published)) {
      html += `<p class="frontmatter-created">Published: ${MarkdownUtils.escapeHtml(
        MarkdownUtils.formatDateLong(published)
      )}</p>`;
    }

    if (!MarkdownUtils.isMissingDate(updated)) {
      html += `<p class="frontmatter-modified">Updated: ${MarkdownUtils.escapeHtml(
        MarkdownUtils.formatDateLong(updated)
      )}</p>`;
    }

    return html ? `<div class="frontmatter-metadata">${html}</div>` : "";
  }

  // ---------------------------------------------------------------- helpers

  getPostDates(frontmatter) {
    const published =
      MarkdownUtils.normalizeText(frontmatter.published) ||
      MarkdownUtils.normalizeText(frontmatter.created) ||
      MarkdownUtils.normalizeText(frontmatter.date) ||
      "";
    const updated =
      MarkdownUtils.normalizeText(frontmatter.updated) ||
      MarkdownUtils.normalizeText(frontmatter.modified) ||
      "";

    return { published, updated };
  }

  buildMetaLine(post) {
    const parts = [];
    if (!MarkdownUtils.isMissingDate(post.published)) {
      parts.push(`Published ${MarkdownUtils.formatDateShort(post.published)}`);
    }
    if (!MarkdownUtils.isMissingDate(post.updated)) {
      parts.push(`Updated ${MarkdownUtils.formatDateShort(post.updated)}`);
    }

    return MarkdownUtils.escapeHtml(parts.join(" · "));
  }

  setScrollTop(value) {
    if (this.scrollContainer) {
      this.scrollContainer.scrollTop = value;
    }
  }

  renderTagChips(tags, className) {
    if (!Array.isArray(tags) || tags.length === 0) {
      return "";
    }

    return tags
      .map((tag) => String(tag).trim())
      .filter(Boolean)
      .map((tag) => {
        const safe = MarkdownUtils.escapeHtml(tag);
        return `<button type="button" class="${className}" data-tag="${safe}" aria-label="Show posts tagged ${safe}">${safe}</button>`;
      })
      .join(" ");
  }

  extractFirstParagraph(content) {
    const blocks = String(content)
      .replace(/```[\s\S]*?```/g, "\n\n")
      .split(/\r?\n\s*\r?\n/);

    for (const rawBlock of blocks) {
      const trimmed = rawBlock.trim();
      if (!trimmed || /^#{1,6}\s+/.test(trimmed) || /^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
        continue;
      }

      const cleaned = MarkdownUtils.toPlainText(trimmed);
      if (cleaned) {
        return MarkdownUtils.truncateString(cleaned, 260);
      }
    }

    return "No preview available.";
  }
}

window.BlogNavigator = BlogNavigator;
