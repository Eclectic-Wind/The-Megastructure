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

  safeDecode(value) {
    try {
      return decodeURIComponent(value);
    } catch (error) {
      return value;
    }
  },
};

window.MarkdownUtils = MarkdownUtils;
