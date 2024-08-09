class RepoNavigator {
    constructor() {
        this.baseApiUrl = 'https://api.github.com/repos/Eclectic-Wind/The-Megastructure-Archives/contents';
        this.container = document.getElementById('repo-navigator-container');
        this.currentPath = [];
        this.markedAvailable = typeof marked !== 'undefined';
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
        this.previousState = null;

        // Add cache properties
        this.contentCache = new Map();
        this.fileCache = new Map();
        this.cacheMaxAge = 5 * 60 * 1000; // 5 minutes in milliseconds
    }

    init() {
        if (!this.container) {
            console.error('repo-navigator-container not found in the DOM');
            return;
        }
        this.createUI();
        this.fetchContents();
    }

    createUI() {
        this.container.innerHTML = `
            <div id="repo-breadcrumb"></div>
            <input type="text" id="repo-search" placeholder="Search through titles or tags...">
            <div id="repo-content-list"></div>
            <div id="search-results"></div>
            <div id="file-content" class="markdown-body"></div>
        `;
        this.breadcrumb = document.getElementById('repo-breadcrumb');
        this.contentList = document.getElementById('repo-content-list');
        this.fileContent = document.getElementById('file-content');
        this.searchBar = document.getElementById('repo-search');
        this.searchResults = document.getElementById('search-results');
        
        if (!this.breadcrumb || !this.contentList || !this.fileContent || !this.searchBar || !this.searchResults) {
            throw new Error('Failed to create UI elements');
        }

        this.searchBar.addEventListener('input', () => this.handleAutoSearch());
    }

    async fetchContents(path = '') {
        const cacheKey = path || 'root';
        const cachedContent = this.contentCache.get(cacheKey);
        
        if (cachedContent && (Date.now() - cachedContent.timestamp < this.cacheMaxAge)) {
            this.currentContents = cachedContent.data;
            this.displayContents(this.currentContents);
            return;
        }

        try {
            const url = path ? `${this.baseApiUrl}/${path}` : this.baseApiUrl;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            this.currentContents = await response.json();
            
            // Cache the fetched content
            this.contentCache.set(cacheKey, {
                data: this.currentContents,
                timestamp: Date.now()
            });

            this.displayContents(this.currentContents);
        } catch (error) {
            console.error('Error fetching contents:', error);
            this.showError('Error loading repository contents. Please try again later.');
        }
    }

    displayContents(contents) {
        this.contentList.innerHTML = '';
        this.hideFileContent();
        this.hideSearchResults();
        contents.forEach(item => this.createContentItem(item));
        this.updateBreadcrumb();
    }

    createContentItem(item) {
        const itemElement = document.createElement('div');
        itemElement.className = 'repo-item';
        const icon = item.type === 'dir' ? '<i class="fas fa-folder"></i>' : '<i class="fas fa-file"></i>';
        const truncatedName = this.truncateString(item.name, 30);
        itemElement.innerHTML = `${icon} <span class="${item.type}">${truncatedName}</span>`;
        
        if (item.type === 'file') {
            this.addTagsToItem(itemElement, item);
        }
        
        itemElement.addEventListener('click', () => {
            item.type === 'dir' ? this.navigateToFolder(item.path) : this.showFileContent(item);
        });
        this.contentList.appendChild(itemElement);
    }

    truncateString(str, num) {
        if (str.length <= num) {
            return str;
        }
        return str.slice(0, num) + '...';
    }

    async addTagsToItem(element, item) {
        try {
            const content = await this.fetchFileContent(item);
            const frontmatter = this.extractFrontmatter(content);
            if (frontmatter && frontmatter.tags) {
                const tagsElement = document.createElement('span');
                tagsElement.className = 'item-tags';
                tagsElement.textContent = frontmatter.tags.join(', ');
                element.setAttribute('title', `Tags: ${tagsElement.textContent}`);
            }
        } catch (error) {
            console.error('Error fetching file content for tags:', error);
        }
    }
    
    async showFileContent(file) {
        try {
            this.savePreviousState();
            let content = await this.fetchFileContent(file);
            const frontmatter = this.extractFrontmatter(content);
            content = this.removeFrontmatter(content);
            this.hideNavigator();
            this.renderFileContent(file, content, frontmatter);
        } catch (error) {
            console.error('Error fetching file content:', error);
            this.showError('Error loading file content. Please try again later.');
        }
    }

    async fetchFileContent(file) {
        const cacheKey = file.path;
        const cachedContent = this.fileCache.get(cacheKey);
        
        if (cachedContent && (Date.now() - cachedContent.timestamp < this.cacheMaxAge)) {
            return cachedContent.data;
        }

        let content;
        try {
            const response = await fetch(file.download_url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            content = await response.text();

            if (content.startsWith('version https://git-lfs.github.com/spec/v1')) {
                content = await this.fetchLFSContent(file);
            }

            // Cache the fetched content
            this.fileCache.set(cacheKey, {
                data: content,
                timestamp: Date.now()
            });

            return content;
        } catch (error) {
            console.error('Error fetching file content:', error);
            throw error;
        }
    }

    async fetchLFSContent(file) {
        const lfsUrl = `https://media.githubusercontent.com/media/Eclectic-Wind/The-Megastructure-Archives/main/${file.path}`;
        const response = await fetch(lfsUrl);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.text();
    }

    renderFileContent(file, content, frontmatter) {
        // Create back button
        const backButton = `<button id="back-button"><i class="fas fa-arrow-left"></i> Back</button>`;
        
        // Generate tags HTML
        let tagsHtml = '';
        if (frontmatter && frontmatter.tags && frontmatter.tags.length > 0) {
            const tagLinks = frontmatter.tags.map(tag => `<a href="#" class="tag-link">${tag}</a>`).join(', ');
            tagsHtml = `<p>Tags: ${tagLinks}</p>`;
        }
        
        // Update breadcrumb to include the current file
        this.updateBreadcrumb(file.name);
        
        // Render content based on file type
        let renderedContent;
        if (file.name.endsWith('.md') && this.markedAvailable) {
            renderedContent = marked.parse(content);
        } else {
            renderedContent = `<pre>${this.escapeHtml(content)}</pre>`;
        }
        
        // Combine all elements
        this.fileContent.innerHTML = `
            ${backButton}
            ${tagsHtml}
            <div class="file-content-body">
                ${renderedContent}
            </div>
        `;
        
        // Show the file content
        this.fileContent.style.display = 'block';
        
        // Add event listener to back button
        document.getElementById('back-button').addEventListener('click', () => this.goBack());
        
        // Add event listeners to tag links
        this.fileContent.querySelectorAll('.tag-link').forEach(tagLink => {
            tagLink.addEventListener('click', (e) => {
                e.preventDefault();
                const tagText = e.target.textContent;
                this.goBack();
                this.searchBar.value = tagText;
                this.handleAutoSearch();
            });
        });
    }

    extractFrontmatter(content) {
        const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
        const match = content.match(frontmatterRegex);
        if (match) {
            const frontmatterString = match[1];
            const frontmatter = {};
            frontmatterString.split('\n').forEach(line => {
                const [key, ...value] = line.split(':');
                if (key && value) {
                    frontmatter[key.trim()] = value.join(':').trim();
                }
            });
            if (frontmatter.tags) {
                frontmatter.tags = frontmatter.tags.replace(/[\[\]]/g, '').split(',').map(tag => tag.trim());
            }
            return frontmatter;
        }
        return null;
    }

    removeFrontmatter(content) {
        return content.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');
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
        this.currentPath = path.split('/');
        this.fetchContents(path);
        this.hideFileContent();
        this.hideSearchResults();
        this.searchBar.value = ''; // Clear search bar when navigating
    }

    updateBreadcrumb(currentFile = null) {
        this.breadcrumb.innerHTML = '<span class="breadcrumb-item" data-path=""><i class="fas fa-folder"></i> Archives</span>';
        let currentPathString = '';
        this.currentPath.forEach(folder => {
            currentPathString += `/${folder}`;
            this.breadcrumb.innerHTML += ` / <span class="breadcrumb-item" data-path="${currentPathString}">${folder}</span>`;
        });
        if (currentFile) {
            this.breadcrumb.innerHTML += ` / <span class="breadcrumb-item current-file">${currentFile}</span>`;
        }
        this.addBreadcrumbListeners();
    }

    addBreadcrumbListeners() {
        this.breadcrumb.querySelectorAll('.breadcrumb-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const path = e.target.getAttribute('data-path');
                this.navigateToFolder(path ? path.slice(1) : '');
            });
        });
    }

    hideNavigator() {
        this.searchBar.style.display = 'none';
        this.contentList.style.display = 'none';
        this.searchResults.style.display = 'none';
    }

    showNavigator() {
        this.breadcrumb.style.display = 'block';
        this.searchBar.style.display = 'block';
        this.contentList.style.display = 'block';
        this.hideFileContent();
    }

    hideFileContent() {
        this.fileContent.style.display = 'none';
    }

    hideSearchResults() {
        this.searchResults.style.display = 'none';
        this.contentList.style.display = 'block';
    }

    showSearchResults() {
        this.searchResults.style.display = 'block';
        this.contentList.style.display = 'none';
        this.hideFileContent();
    }

    showError(message) {
        this.contentList.innerHTML = `<p>${message}</p>`;
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
        this.searchResults.innerHTML = 'Searching...';
        this.showSearchResults();

        this.searchAbortController = new AbortController();

        try {
            if (this.cachedResults.has(searchTerm)) {
                this.displaySearchResults(this.cachedResults.get(searchTerm));
                return;
            }

            const results = await this.performDeepSearch('', searchTerm, this.searchAbortController.signal);
            
            this.cachedResults.set(searchTerm, results);
            
            if (!this.searchAbortController.signal.aborted) {
                this.displaySearchResults(results);
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('Search aborted');
            } else {
                console.error('Error during auto search:', error);
                this.showError('Error performing search. Please try again later.');
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
                throw new DOMException('Search aborted', 'AbortError');
            }

            if (item.type === 'file') {
                const content = await this.fetchFileContent(item);
                const frontmatter = this.extractFrontmatter(content);
                if (
                    item.name.toLowerCase().includes(searchTerm) ||
                    (frontmatter && frontmatter.tags && frontmatter.tags.some(tag => tag.toLowerCase().includes(searchTerm)))
                ) {
                    results.push(item);
                }
            } else if (item.type === 'dir') {
                results.push(item);
                const subResults = await this.performDeepSearch(item.path, searchTerm, signal);
                results.push(...subResults);
            }
        }

        return results;
    }

    async fetchContentsForSearch(path, signal) {
        const cacheKey = path || 'root';
        const cachedContent = this.contentCache.get(cacheKey);
        
        if (cachedContent && (Date.now() - cachedContent.timestamp < this.cacheMaxAge)) {
            return cachedContent.data;
        }

        const url = path ? `${this.baseApiUrl}/${path}` : this.baseApiUrl;
        const response = await fetch(url, { signal });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();

        // Cache the fetched content
        this.contentCache.set(cacheKey, {
            data: data,
            timestamp: Date.now()
        });

        return data;
    }

    displaySearchResults(results) {
        this.searchResults.innerHTML = '';
        if (results.length === 0) {
            this.searchResults.innerHTML = 'No results found.';
            return;
        }
    
        const resultTree = this.buildResultTree(results);
        const resultList = this.renderResultTree(resultTree);
        this.searchResults.appendChild(resultList);
    }
    
    buildResultTree(results) {
        const tree = {};
        results.forEach(item => {
            const parts = item.path.split('/');
            let currentPath = '';
            parts.forEach((part, index) => {
                currentPath += (index > 0 ? '/' : '') + part;
                if (index === parts.length - 1) {
                    tree[currentPath] = item;
                } else if (!tree[currentPath]) {
                    tree[currentPath] = { type: 'directory', name: part, children: {} };
                }
            });
        });
        return tree;
    }
    
    renderResultTree(tree) {
        const rootUl = document.createElement('ul');
        rootUl.className = 'search-result-tree';
    
        const sortedPaths = Object.keys(tree).sort();
        
        sortedPaths.forEach(path => {
            const item = tree[path];
            const parts = path.split('/');
            const name = parts[parts.length - 1];
            const level = parts.length - 1;
    
            const li = document.createElement('li');
            li.className = 'search-result-item';
            li.style.paddingLeft = `${level * 20}px`;
    
            if (item.type === 'file') {
                const fileIcon = '<i class="fas fa-file"></i>';
                const truncatedName = this.truncateString(name, 20);
                li.innerHTML = `${fileIcon} <span class="file-name">${truncatedName}</span>`;
                li.addEventListener('click', () => this.showFileContent(item));
            } else {
                const folderIcon = '<i class="fas fa-folder"></i>';
                li.innerHTML = `${folderIcon} <span class="folder-name">${name}</span>`;
            }
    
            rootUl.appendChild(li);
        });
    
        return rootUl;
    }

    savePreviousState() {
        this.previousState = {
            currentPath: [...this.currentPath],
            searchTerm: this.searchBar.value
        };
    }

    goBack() {
        if (this.previousState) {
            this.currentPath = this.previousState.currentPath;
            this.showNavigator();
            this.searchBar.value = this.previousState.searchTerm;
            if (this.previousState.searchTerm) {
                this.handleAutoSearch();
            } else {
                this.fetchContents(this.currentPath.join('/'));
            }
        } else {
            this.showNavigator();
            this.fetchContents();
        }
    }

    clearCache() {
        this.contentCache.clear();
        this.fileCache.clear();
        console.log('Cache cleared');
    }
}

function initRepoNavigator() {
    const navigator = new RepoNavigator();
    navigator.init();
}