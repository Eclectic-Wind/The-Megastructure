class BlogNavigator {
  constructor() {
    this.baseApiUrl =
      "https://api.github.com/repos/Eclectic-Wind/The-Megastructure-Archives/contents/blog";
    this.container = document.getElementById("blog-navigator-container");
    this.markedAvailable = typeof marked !== "undefined";
    this.searchBar = null;
    this.listContainer = null;
    this.fileContent = null;
    this.posts = [];
    this.filteredPosts = [];
    this.currentPage = 1;
    this.itemsPerPage = 5;
    this.fileCache = new Map();
    this.cacheMaxAge = 5 * 60 * 1000;
    this.searchDebounceTimer = null;
    this.isInitialized = false;
    this.handleHashChangeBound = this.handleHashChange.bind(this);
  }

  async init() {
    if (this.isInitialized) {
      return;
    }

    if (!this.container) {
      console.error("blog-navigator-container not found in the DOM");
      return;
    }

    this.renderBaseUi();
    await this.loadPosts();
    window.addEventListener("hashchange", this.handleHashChangeBound);
    this.isInitialized = true;
    this.handleHashChange();
  }

  destroy() {
    if (!this.isInitialized) {
      return;
    }

    window.removeEventListener("hashchange", this.handleHashChangeBound);

    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }

    this.isInitialized = false;
  }

  renderBaseUi() {
    this.container.innerHTML = `
      <input type="text" id="blog-search" placeholder="Search through titles, excerpts, or tags...">
      <div id="blog-content-list"></div>
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

  async handleHashChange() {
    const hash = window.location.hash || "";
    const baseHash = "#blog";

    if (!hash.startsWith(baseHash)) {
      return;
    }

    const path = hash.slice(baseHash.length).replace(/^\/+/, "");
    if (!path) {
      this.showListView();
      return;
    }

    await this.openPostByPath(path);
  }

  async loadPosts() {
    const response = await fetch(this.baseApiUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const markdownFiles = data.filter(
      (item) => item.type === "file" && item.name.endsWith(".md")
    );

    const postPromises = markdownFiles.map(async (file) => {
      const content = await this.fetchFileContent(file);
      const frontmatter = this.extractFrontmatter(content) || {};
      const cleanContent = this.removeFrontmatter(content);
      const excerpt = this.extractFirstParagraph(cleanContent);
      const title = this.normalizeText(frontmatter.title) || file.name.replace(/\.md$/i, "");

      const published =
        this.normalizeText(frontmatter.published) ||
        this.normalizeText(frontmatter.created) ||
        this.normalizeText(frontmatter.date) ||
        "";
      const updated =
        this.normalizeText(frontmatter.updated) ||
        this.normalizeText(frontmatter.modified) ||
        "";
      const sortSource = updated || published;

      return {
        file,
        title,
        excerpt,
        tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
        published,
        updated,
        sortTime: this.parseDateToMillis(sortSource),
      };
    });

    const loadedPosts = await Promise.all(postPromises);

    this.posts = loadedPosts.sort((left, right) => {
      if (left.sortTime !== right.sortTime) {
        return right.sortTime - left.sortTime;
      }
      return right.title.localeCompare(left.title);
    });

    this.applySearch("");
  }

  applySearch(rawTerm) {
    const searchTerm = (rawTerm || "").trim().toLowerCase();

    if (!searchTerm) {
      this.filteredPosts = [...this.posts];
    } else {
      this.filteredPosts = this.posts.filter((post) => {
        const titleMatch = post.title.toLowerCase().includes(searchTerm);
        const excerptMatch = post.excerpt.toLowerCase().includes(searchTerm);
        const tagMatch = post.tags.some((tag) =>
          String(tag).toLowerCase().includes(searchTerm)
        );

        return titleMatch || excerptMatch || tagMatch;
      });
    }

    this.renderListPage();
  }

  renderListPage() {
    this.fileContent.style.display = "none";
    this.listContainer.style.display = "block";

    if (this.filteredPosts.length === 0) {
      this.listContainer.innerHTML = '<p class="blog-empty-state">No blog posts found.</p>';
      return;
    }

    const totalPages = Math.max(
      1,
      Math.ceil(this.filteredPosts.length / this.itemsPerPage)
    );
    this.currentPage = Math.min(Math.max(this.currentPage, 1), totalPages);

    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const pageItems = this.filteredPosts.slice(
      startIndex,
      startIndex + this.itemsPerPage
    );

    this.listContainer.innerHTML = "";

    pageItems.forEach((post) => {
      const card = document.createElement("article");
      card.className = "blog-post-card";
      const tagsHtml = this.renderTagChips(post.tags, "blog-post-tag");
      card.innerHTML = `
        <h3 class="blog-post-title">${this.escapeHtml(post.title)}</h3>
        <p class="blog-post-excerpt">${this.escapeHtml(post.excerpt)}</p>
        ${tagsHtml ? `<div class="blog-post-tags">${tagsHtml}</div>` : ""}
        <p class="blog-post-meta">${this.buildMetaLine(post)}</p>
      `;

      card.addEventListener("click", () => {
        this.openPost(post.file);
      });

      card.querySelectorAll(".blog-post-tag").forEach((tagButton) => {
        tagButton.addEventListener("click", (event) => {
          event.stopPropagation();
          const tagValue = tagButton.getAttribute("data-tag") || "";
          this.searchByTag(tagValue);
        });
      });

      this.listContainer.appendChild(card);
    });

    this.listContainer.appendChild(this.createPaginationControls(totalPages));
  }

  createPaginationControls(totalPages) {
    const controls = document.createElement("div");
    controls.className = "blog-pagination";

    const prevButton = document.createElement("button");
    prevButton.className = "blog-page-button";
    prevButton.textContent = "Previous";
    prevButton.disabled = this.currentPage <= 1;
    prevButton.addEventListener("click", () => {
      if (this.currentPage > 1) {
        this.currentPage -= 1;
        this.renderListPage();
      }
    });

    const indicator = document.createElement("span");
    indicator.className = "blog-page-indicator";
    indicator.textContent = `Page ${this.currentPage} of ${totalPages}`;

    const nextButton = document.createElement("button");
    nextButton.className = "blog-page-button";
    nextButton.textContent = "Next";
    nextButton.disabled = this.currentPage >= totalPages;
    nextButton.addEventListener("click", () => {
      if (this.currentPage < totalPages) {
        this.currentPage += 1;
        this.renderListPage();
      }
    });

    controls.appendChild(prevButton);
    controls.appendChild(indicator);
    controls.appendChild(nextButton);
    return controls;
  }

  async openPostByPath(relativePath) {
    const fullPath = relativePath.startsWith("blog/")
      ? relativePath
      : `blog/${relativePath}`;

    try {
      const response = await fetch(
        `https://api.github.com/repos/Eclectic-Wind/The-Megastructure-Archives/contents/${fullPath}`
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const file = await response.json();
      await this.openPost(file, false);
    } catch (error) {
      console.error("Error opening blog post by path:", error);
      this.listContainer.innerHTML =
        '<p class="blog-empty-state">Unable to load this blog post right now.</p>';
      this.showListView();
    }
  }

  async openPost(file, updateHash = true) {
    try {
      const content = await this.fetchFileContent(file);
      const frontmatter = this.extractFrontmatter(content);
      const body = this.removeFrontmatter(content);

      this.listContainer.style.display = "none";
      this.fileContent.style.display = "block";

      const renderedContent =
        file.name.endsWith(".md") && this.markedAvailable
          ? marked.parse(body)
          : `<pre>${this.escapeHtml(body)}</pre>`;

      this.fileContent.innerHTML = `
        <button class="blog-back-button" type="button">Back to Blog</button>
        ${this.renderFrontmatter(frontmatter)}
        <div class="file-content-body">${renderedContent}</div>
      `;

      const backButton = this.fileContent.querySelector(".blog-back-button");
      if (backButton) {
        backButton.addEventListener("click", () => {
          window.location.hash = "#blog";
          this.showListView();
        });
      }

      this.fileContent.querySelectorAll(".blog-tag-link").forEach((tagLink) => {
        tagLink.addEventListener("click", (event) => {
          event.preventDefault();
          const tagValue = tagLink.getAttribute("data-tag") || "";
          this.searchByTag(tagValue);
          window.location.hash = "#blog";
        });
      });

      if (updateHash) {
        const relativePath = file.path.replace(/^blog\//, "");
        const targetHash = `#blog/${relativePath}`;
        if (window.location.hash !== targetHash) {
          window.location.hash = targetHash;
        }
      }
    } catch (error) {
      console.error("Error opening blog post:", error);
      this.fileContent.style.display = "none";
      this.listContainer.style.display = "block";
      this.listContainer.innerHTML =
        '<p class="blog-empty-state">Unable to open this blog post right now.</p>';
    }
  }

  showListView() {
    this.fileContent.style.display = "none";
    this.listContainer.style.display = "block";
    this.renderListPage();
  }

  fetchFileContent(file) {
    const cacheKey = file.path;
    const cached = this.fileCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheMaxAge) {
      return Promise.resolve(cached.data);
    }

    return fetch(file.download_url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
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
    return fetch(lfsUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.text();
      })
      .then((content) => {
        this.fileCache.set(file.path, {
          data: content,
          timestamp: Date.now(),
        });
        return content;
      });
  }

  renderFrontmatter(frontmatter) {
    if (!frontmatter) {
      return "";
    }

    const published =
      this.normalizeText(frontmatter.published) ||
      this.normalizeText(frontmatter.created) ||
      this.normalizeText(frontmatter.date) ||
      "";
    const updated =
      this.normalizeText(frontmatter.updated) ||
      this.normalizeText(frontmatter.modified) ||
      "";
    const tags = Array.isArray(frontmatter.tags) ? frontmatter.tags : [];

    let html = '<div class="frontmatter-metadata">';

    if (tags.length > 0) {
      html += `<p class="frontmatter-tags">Tags: ${this.renderTagChips(
        tags,
        "blog-tag-link"
      )}</p>`;
    }

    if (published) {
      html += `<p class="frontmatter-created">Published: ${this.escapeHtml(
        this.formatDateLong(published)
      )}</p>`;
    }

    if (updated) {
      html += `<p class="frontmatter-modified">Updated: ${this.escapeHtml(
        this.formatDateLong(updated)
      )}</p>`;
    }

    html += "</div>";
    return html;
  }

  buildMetaLine(post) {
    const publishedText = post.published
      ? `Published: ${this.formatDateShort(post.published)}`
      : "Published: N/A";
    const updatedText = post.updated
      ? `Updated: ${this.formatDateShort(post.updated)}`
      : "Updated: N/A";

    return `${publishedText} · ${updatedText}`;
  }

  renderTagChips(tags, className) {
    if (!Array.isArray(tags) || tags.length === 0) {
      return "";
    }

    return tags
      .map((tag) => String(tag).trim())
      .filter(Boolean)
      .map(
        (tag) =>
          `<button type="button" class="${className}" data-tag="${this.escapeHtml(
            tag
          )}">${this.escapeHtml(tag)}</button>`
      )
      .join(" ");
  }

  searchByTag(tagValue) {
    const normalizedTag = String(tagValue || "").trim();
    if (!normalizedTag) {
      return;
    }

    this.currentPage = 1;
    this.searchBar.value = normalizedTag;
    this.applySearch(normalizedTag);
  }

  extractFrontmatter(content) {
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
    const match = content.match(frontmatterRegex);
    if (!match) {
      return null;
    }

    const frontmatter = {};
    match[1].split("\n").forEach((line) => {
      const colonIndex = line.indexOf(":");
      if (colonIndex === -1) {
        return;
      }

      const key = line.slice(0, colonIndex).trim().toLowerCase();
      const value = line.slice(colonIndex + 1).trim();

      if (key === "tags") {
        frontmatter[key] = value
          .replace(/[\[\]]/g, "")
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean);
      } else {
        frontmatter[key] = value.replace(/^['"]|['"]$/g, "");
      }
    });

    return frontmatter;
  }

  removeFrontmatter(content) {
    return content.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, "");
  }

  extractFirstParagraph(content) {
    const blocks = content.split(/\n\s*\n/);

    for (const rawBlock of blocks) {
      const trimmedRaw = rawBlock.trim();

      if (!trimmedRaw) {
        continue;
      }

      if (/^#{1,6}\s+/.test(trimmedRaw)) {
        continue;
      }

      if (/^```/.test(trimmedRaw)) {
        continue;
      }

      const cleaned = this.cleanMarkdownText(trimmedRaw).trim();
      if (cleaned) {
        return this.truncateString(cleaned, 260);
      }
    }

    return "No preview available.";
  }

  cleanMarkdownText(text) {
    return text
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/^>\s?/gm, "")
      .replace(/^[-*+]\s+/gm, "")
      .replace(/\s+/g, " ");
  }

  parseDateToMillis(dateString) {
    if (!dateString) {
      return 0;
    }

    if (this.isMissingDate(dateString)) {
      return 0;
    }

    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
      return 0;
    }

    return date.getTime();
  }

  formatDateShort(dateString) {
    if (this.isMissingDate(dateString)) {
      return "N/A";
    }

    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
      return dateString;
    }

    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  formatDateLong(dateString) {
    if (this.isMissingDate(dateString)) {
      return "N/A";
    }

    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
      return dateString;
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
  }

  normalizeText(value) {
    if (typeof value !== "string") {
      return "";
    }

    return value.trim().replace(/^['"]|['"]$/g, "");
  }

  isMissingDate(value) {
    if (typeof value !== "string") {
      return true;
    }

    const normalized = value.trim().toLowerCase();
    return !normalized || normalized === "n/a" || normalized === "na";
  }

  truncateString(str, maxLength) {
    if (str.length <= maxLength) {
      return str;
    }

    return `${str.slice(0, maxLength).trimEnd()}...`;
  }

  escapeHtml(unsafe) {
    return String(unsafe)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}

window.BlogNavigator = BlogNavigator;