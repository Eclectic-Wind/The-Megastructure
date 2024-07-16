export class DataAttributeHandler {
    constructor() {
        this.attributeName = 'data-attribute';
        this.containerClass = 'extra-information';
    }

    init() {
        this.container = document.querySelector(`.${this.containerClass}`);
        if (!this.container) {
            console.error(`Container with class "${this.containerClass}" not found.`);
            return;
        }
        this.addHoverListeners();
        this.setupMutationObserver();
        this.calculateAndDisplayAge();
    }

    addHoverListeners(root = document) {
        const elements = root.querySelectorAll(`[${this.attributeName}]`);
        elements.forEach(element => {
            element.addEventListener('mouseenter', () => this.showAttribute(element));
            element.addEventListener('mouseleave', () => this.hideAttribute());
        });
    }

    showAttribute(element) {
        const attributeContent = element.getAttribute(this.attributeName);
        if (attributeContent) {
            const formattedContent = this.parseMarkdown(attributeContent);
            this.container.innerHTML = formattedContent;
            this.container.style.display = 'block';
        }
    }

    hideAttribute() {
        this.container.style.display = 'none';
        this.container.innerHTML = '';
    }

    parseMarkdown(text) {
        return text
            .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/__(.+?)__/g, '<u>$1</u>')
            .replace(/\/br/g, '<br>')
            .split('\n')
            .map(line => `<p>${line}</p>`)
            .join('');
    }

    setupMutationObserver() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            this.addHoverListeners(node);
                            if (node.hasAttribute(this.attributeName)) {
                                this.addHoverListeners(node.parentNode);
                            }
                            this.calculateAndDisplayAge();
                        }
                    });
                }
            });
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    calculateAndDisplayAge() {
        const ageDisplay = document.getElementById('ageDisplay');
        if (!ageDisplay) return;

        const birthDate = new Date(ageDisplay.dataset.birthdate);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        
        ageDisplay.textContent = age;
    }
}