// Shared helpers for the blog and archives navigators (classic script, exposed
// on window so both navigators can use it without a module loader).
const MarkdownUtils = {
  FRONTMATTER_PATTERN: /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/,
  LIST_KEYS: ["tags", "aliases"],

  // Minimal YAML frontmatter parser. Handles `key: value`, inline lists
  // (`tags: [a, b]` or `tags: a, b`) and block lists:
  //   tags:
  //     - a
  extractFrontmatter(content) {
    const match = String(content).match(this.FRONTMATTER_PATTERN);
    if (!match) {
      return null;
    }

    const frontmatter = {};
    let listKey = null;

    match[1].split(/\r?\n/).forEach((line) => {
      const listItem = line.match(/^\s*-\s+(.*)$/);
      if (listItem && listKey) {
        const item = this.normalizeText(listItem[1]);
        if (item) {
          frontmatter[listKey].push(item);
        }
        return;
      }

      const colonIndex = line.indexOf(":");
      if (colonIndex === -1 || /^\s/.test(line)) {
        return;
      }

      const key = line.slice(0, colonIndex).trim().toLowerCase();
      const value = line.slice(colonIndex + 1).trim();
      listKey = null;

      if (this.LIST_KEYS.includes(key)) {
        frontmatter[key] = value
          .replace(/[\[\]]/g, "")
          .split(",")
          .map((item) => this.normalizeText(item))
          .filter(Boolean);
        if (!value) {
          listKey = key;
        }
      } else {
        frontmatter[key] = this.normalizeText(value);
      }
    });

    return frontmatter;
  },

  removeFrontmatter(content) {
    return String(content).replace(this.FRONTMATTER_PATTERN, "");
  },

  normalizeText(value) {
    if (typeof value !== "string") {
      return "";
    }

    return value.trim().replace(/^['"]|['"]$/g, "");
  },

  isMissingDate(value) {
    if (typeof value !== "string") {
      return true;
    }

    const normalized = value.trim().toLowerCase();
    return !normalized || normalized === "n/a" || normalized === "na";
  },

  // `new Date("2026-02-28")` is parsed as UTC midnight, which shows up as the
  // previous day west of UTC, so date-only values are built in local time.
  parseDate(dateString) {
    if (this.isMissingDate(dateString)) {
      return null;
    }

    const value = String(dateString).trim();
    const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const date = dateOnly
      ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
      : new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
  },

  parseDateToMillis(dateString) {
    const date = this.parseDate(dateString);
    return date ? date.getTime() : 0;
  },

  formatDateShort(dateString) {
    if (this.isMissingDate(dateString)) {
      return "N/A";
    }

    const date = this.parseDate(dateString);
    if (!date) {
      return dateString;
    }

    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  },

  formatDateLong(dateString) {
    if (this.isMissingDate(dateString)) {
      return "N/A";
    }

    const date = this.parseDate(dateString);
    if (!date) {
      return dateString;
    }

    if (!/\d{1,2}:\d{2}/.test(String(dateString))) {
      return date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    }

    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });
  },

  truncateString(str, maxLength) {
    const value = String(str);
    if (value.length <= maxLength) {
      return value;
    }

    return `${value.slice(0, maxLength).trimEnd()}...`;
  },

  escapeHtml(unsafe) {
    return String(unsafe)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  },

  // ------------------------------------------------------------ rendering

  // Renders Obsidian-flavoured markdown to HTML.
  //   options.rawBaseUrl  - base URL that repo paths are appended to
  //   options.dirPath     - repo folder of the document (for relative paths)
  //   options.linkForPath - (repoPath) => in-site href for markdown links
  renderMarkdown(markdown, options = {}) {
    const source = this.preprocessObsidian(String(markdown));
    const html =
      typeof marked !== "undefined"
        ? marked.parse(source)
        : `<pre>${this.escapeHtml(markdown)}</pre>`;

    return this.postprocessHtml(html, options);
  },

  // Applies Obsidian syntax outside of code spans/blocks only.
  preprocessObsidian(text) {
    return text
      .split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/)
      .map((segment, index) => {
        if (index % 2 === 1) {
          return segment; // code: leave untouched
        }

        return segment
          .replace(/%%[\s\S]*?%%/g, "")
          .replace(/!\[\[([^\]|]+?)(?:\|[^\]]*)?\]\]/g, (match, target) =>
            `![${target.split("/").pop()}](<${target.trim()}>)`
          )
          .replace(/\[\[([^\]|#]*)(#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (match, target, heading, alias) => {
            const label = (alias || target || (heading || "").slice(1)).trim();
            if (!target.trim()) {
              return label;
            }
            const file = /\.[a-z0-9]+$/i.test(target.trim()) ? target.trim() : `${target.trim()}.md`;
            return `[${label}](<${file}>)`;
          })
          .replace(/==([^=\n]+)==/g, "<mark>$1</mark>")
          .replace(/^(\s*>\s*)\[!(\w+)\][+-]?\s*(.*)$/gm, (match, prefix, type, title) =>
            `${prefix}**${title.trim() || type.charAt(0).toUpperCase() + type.slice(1)}**`
          );
      })
      .join("");
  },

  postprocessHtml(html, { rawBaseUrl = "", dirPath = "", linkForPath = null } = {}) {
    const template = document.createElement("template");
    template.innerHTML = html;
    const isExternal = (value) => /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value);

    template.content.querySelectorAll("img[src]").forEach((img) => {
      const src = img.getAttribute("src");
      if (rawBaseUrl && !isExternal(src) && !src.startsWith("#")) {
        img.setAttribute("src", rawBaseUrl + this.encodeRepoPath(this.resolveRepoPath(dirPath, src)));
      }
      img.setAttribute("loading", "lazy");
      img.classList.add("md-img");
    });

    template.content.querySelectorAll("a[href]").forEach((link) => {
      const href = link.getAttribute("href");
      if (href.startsWith("#")) {
        return;
      }

      if (isExternal(href)) {
        link.setAttribute("target", "_blank");
        link.setAttribute("rel", "noopener");
        return;
      }

      const [pathPart] = href.split("#");
      const repoPath = this.resolveRepoPath(dirPath, pathPart);
      if (/\.md$/i.test(repoPath) && linkForPath) {
        link.setAttribute("href", linkForPath(repoPath));
      } else if (rawBaseUrl) {
        link.setAttribute("href", rawBaseUrl + this.encodeRepoPath(repoPath));
        link.setAttribute("target", "_blank");
        link.setAttribute("rel", "noopener");
      }
    });

    // Wide tables scroll on their own instead of stretching the page.
    template.content.querySelectorAll("table").forEach((table) => {
      const wrapper = document.createElement("div");
      wrapper.className = "table-wrapper";
      table.replaceWith(wrapper);
      wrapper.appendChild(table);
    });

    return template.innerHTML;
  },

  resolveRepoPath(dirPath, relativePath) {
    const decoded = this.safeDecode(String(relativePath).trim());
    const parts = decoded.startsWith("/") ? [] : String(dirPath).split("/").filter(Boolean);

    decoded.split("/").forEach((part) => {
      if (!part || part === ".") return;
      if (part === "..") parts.pop();
      else parts.push(part);
    });

    return parts.join("/");
  },

  encodeRepoPath(path) {
    return path.split("/").map(encodeURIComponent).join("/");
  },

  // Plain-text version of a markdown snippet, for excerpts and search.
  toPlainText(markdown) {
    return String(markdown)
      .replace(/%%[\s\S]*?%%/g, "")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/!\[\[[^\]]*\]\]/g, "")
      .replace(/\[\[([^\]|]*)(?:\|([^\]]+))?\]\]/g, (match, target, alias) =>
        (alias || target.split("#")[0]).trim()
      )
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/<[^>]+>/g, "")
      .replace(/^>\s?(\[!\w+\][+-]?\s*)?/gm, "")
      .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, "")
      .replace(/(\*\*|__|==|~~)(.+?)\1/g, "$2")
      .replace(/(^|[^\w*])[*_]([^*_\n]+)[*_](?=[^\w*]|$)/g, "$1$2")
      .replace(/\s+/g, " ")
      .trim();
  },

  // ---------------------------------------------------------------- search

  // Lowercase and strip accents so "cafe" finds "café".
  normalizeForSearch(text) {
    return String(text || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
  },

  // Every word of the query must start a word somewhere in the fields, so
  // "test" matches "testing" but not "latest". Fields should already be
  // normalised with normalizeForSearch().
  matchesQuery(fields, query) {
    const terms = this.normalizeForSearch(query).split(/\s+/).filter(Boolean);
    if (terms.length === 0) {
      return true;
    }

    return terms.every((term) => {
      const pattern = new RegExp(
        `(?:^|[^\\p{L}\\p{N}])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
        "u"
      );
      return fields.some((field) => pattern.test(field));
    });
  },

  safeDecode(value) {
    try {
      return decodeURIComponent(value);
    } catch (error) {
      return value;
    }
  },
};

window.MarkdownUtils = MarkdownUtils;

// Fade markdown images in once they've loaded (or failed) instead of letting
// them pop in line by line.
document.addEventListener(
  "load",
  (event) => {
    if (event.target instanceof HTMLImageElement && event.target.classList.contains("md-img")) {
      event.target.classList.add("is-loaded");
    }
  },
  true
);
document.addEventListener(
  "error",
  (event) => {
    if (event.target instanceof HTMLImageElement && event.target.classList.contains("md-img")) {
      event.target.classList.add("is-loaded", "is-broken");
    }
  },
  true
);
