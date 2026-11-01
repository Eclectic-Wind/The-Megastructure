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
    this.currentPostPath = null;
    this.loadError = false;
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

    try {
      await this.loadPosts();
    } catch (error) {
      console.error("Error loading blog posts:", error);
      this.loadError = true;
    }

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
      let content;
      try {
        content = await this.fetchFileContent(file);
      } catch (error) {
        console.error(`Error loading blog post ${file.path}:`, error);
        return null;
      }

      const frontmatter = MarkdownUtils.extractFrontmatter(content) || {};
      const cleanContent = MarkdownUtils.removeFrontmatter(content);
      const excerpt = this.extractFirstParagraph(cleanContent);
      const title = MarkdownUtils.normalizeText(frontmatter.title) || file.name.replace(/\.md$/i, "");
      const { published, updated } = this.getPostDates(frontmatter);

      return {
        file,
        title,
        excerpt,
        tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
        published,
        updated,
        sortTime: MarkdownUtils.parseDateToMillis(updated || published),
      };
    });

    const loadedPosts = (await Promise.all(postPromises)).filter(Boolean);

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

    if (this.loadError) {
      this.listContainer.innerHTML =
        '<p class="blog-empty-state">Unable to load blog posts right now. Please try again later.</p>';
      return;
    }

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
        <h3 class="blog-post-title">${MarkdownUtils.escapeHtml(post.title)}</h3>
        <p class="blog-post-excerpt">${MarkdownUtils.escapeHtml(post.excerpt)}</p>
        ${tagsHtml ? `<div class="blog-post-tags">${tagsHtml}</div>` : ""}
        <p class="blog-post-meta">${this.buildMetaLine(post)}</p>
      `;

      card.tabIndex = 0;
      card.setAttribute("role", "link");
      card.addEventListener("click", () => {
        this.openPost(post.file);
      });
      card.addEventListener("keydown", (event) => {
        if (event.target === card && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          this.openPost(post.file);
        }
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
    const decodedPath = MarkdownUtils.safeDecode(relativePath);
    const fullPath = decodedPath.startsWith("blog/")
      ? decodedPath
      : `blog/${decodedPath}`;

    // openPost() updates the hash, which fires hashchange and lands here
    // again; don't re-render (or re-fetch) a post that is already open.
    if (this.currentPostPath === fullPath && this.fileContent.style.display !== "none") {
      return;
    }

    // Posts listed in the index already carry their file metadata, so only
    // fall back to the (rate-limited) contents API for unlisted paths.
    const knownPost = this.posts.find((post) => post.file.path === fullPath);
    if (knownPost) {
      await this.openPost(knownPost.file, false);
      return;
    }

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
      // Show the message instead of immediately re-rendering the list over it.
      this.currentPostPath = null;
      this.fileContent.style.display = "none";
      this.listContainer.style.display = "block";
      this.listContainer.innerHTML =
        '<p class="blog-empty-state">Unable to load this blog post right now.</p>';
    }
  }

  async openPost(file, updateHash = true) {
    try {
      const content = await this.fetchFileContent(file);
      const frontmatter = MarkdownUtils.extractFrontmatter(content);
      const body = MarkdownUtils.removeFrontmatter(content);

      this.listContainer.style.display = "none";
      this.fileContent.style.display = "block";

      const renderedContent =
        file.name.endsWith(".md") && this.markedAvailable
          ? marked.parse(body)
          : `<pre>${MarkdownUtils.escapeHtml(body)}</pre>`;

      this.fileContent.innerHTML = `
        <button class="blog-back-button" type="button">Back to Blog</button>
        ${this.renderFrontmatter(frontmatter)}
        <div class="file-content-body">${renderedContent}</div>
      `;

      const backButton = this.fileContent.querySelector(".blog-back-button");
      if (backButton) {
        backButton.addEventListener("click", () => {
          // The hashchange handler renders the list view.
          window.location.hash = "#blog";
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

      this.currentPostPath = file.path;
    } catch (error) {
      console.error("Error opening blog post:", error);
      this.currentPostPath = null;
      this.fileContent.style.display = "none";
      this.listContainer.style.display = "block";
      this.listContainer.innerHTML =
        '<p class="blog-empty-state">Unable to open this blog post right now.</p>';
    }
  }

  showListView() {
    this.currentPostPath = null;
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

    const { published, updated } = this.getPostDates(frontmatter);
    const tags = Array.isArray(frontmatter.tags) ? frontmatter.tags : [];

    let html = '<div class="frontmatter-metadata">';

    if (tags.length > 0) {
      html += `<p class="frontmatter-tags">Tags: ${this.renderTagChips(
        tags,
        "blog-tag-link"
      )}</p>`;
    }

    if (published) {
      html += `<p class="frontmatter-created">Published: ${MarkdownUtils.escapeHtml(
        MarkdownUtils.formatDateLong(published)
      )}</p>`;
    }

    if (updated) {
      html += `<p class="frontmatter-modified">Updated: ${MarkdownUtils.escapeHtml(
        MarkdownUtils.formatDateLong(updated)
      )}</p>`;
    }

    html += "</div>";
    return html;
  }

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
    const publishedText = post.published
      ? `Published: ${MarkdownUtils.formatDateShort(post.published)}`
      : "Published: N/A";
    const updatedText = post.updated
      ? `Updated: ${MarkdownUtils.formatDateShort(post.updated)}`
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
          `<button type="button" class="${className}" data-tag="${MarkdownUtils.escapeHtml(
            tag
          )}">${MarkdownUtils.escapeHtml(tag)}</button>`
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
        return MarkdownUtils.truncateString(cleaned, 260);
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
}

window.BlogNavigator = BlogNavigator;