import { elements } from './elements.js';
import { config } from './config.js';
import { utils } from './utils.js';

const state = {
    card: {
        width: 0,
        height: 0
    },
    content: {
        width: 0,
        height: 0
    }
};

export const CardParallax = {
    isParallaxEnabled: true,

    handleMouseMove(e) {
        if (this.isParallaxEnabled) {
            this.updateCardParallax(e);
        }
        this.updateContentSpotlight(e); // Always update the spotlight
    },

    updateCardParallax(e) {
        const { x: mouseX, y: mouseY } = utils.calculateMousePosition(e, elements.cardContainer);
        const { width: cardWidth, height: cardHeight } = state.card;
        const { multiplier, rotationFactor, backgroundMoveFactor, contentMoveFactor, profileMoveFactor } = config.parallax;

        const mousePX = (mouseX - cardWidth / 2) * multiplier / cardWidth;
        const mousePY = (mouseY - cardHeight / 2) * multiplier / cardHeight;
        
        const rX = mousePX * rotationFactor;
        const rY = mousePY * -rotationFactor;
        
        elements.cardContainer.style.transform = `rotateY(${rX}deg) rotateX(${rY}deg)`;
        elements.background.style.transform = `translate(${mousePX * backgroundMoveFactor}px, ${mousePY * backgroundMoveFactor}px)`;
        
        const contentTransform = `translate(${mousePX * contentMoveFactor}px, ${mousePY * contentMoveFactor}px)`;
        elements.content.style.transform = contentTransform;
        elements.spotlight.style.transform = contentTransform;
        
        elements.profile.style.transform = `translate(${mousePX * profileMoveFactor}px, ${mousePY * profileMoveFactor}px)`;
    },

    updateContentSpotlight(e) {
        const contentRect = elements.content.getBoundingClientRect();
        const containerRect = elements.contentContainer.getBoundingClientRect();
        const mousePos = utils.calculateMousePosition(e, elements.contentContainer);
        
        if (utils.isPointInRect(mousePos, contentRect)) {
            const spotlightCenterX = ((mousePos.x - (contentRect.left - containerRect.left)) / contentRect.width) * 100;
            const spotlightCenterY = ((mousePos.y - (contentRect.top - containerRect.top)) / contentRect.height) * 100;
            
            const spotlightWidth = contentRect.width * config.parallax.spotlightSizeIncrease;
            const spotlightHeight = contentRect.height * config.parallax.spotlightSizeIncrease;
            
            const leftOffset = (spotlightWidth - contentRect.width) / 2;
            const topOffset = (spotlightHeight - contentRect.height) / 2;
            
            Object.assign(elements.spotlight.style, {
                left: `${contentRect.left - containerRect.left - leftOffset}px`,
                top: `${contentRect.top - containerRect.top - topOffset -60}px`,
                width: `${spotlightWidth}px`,
                height: `${spotlightHeight + 50}px`,
                opacity: '1'
            });
            
            elements.spotlight.style.setProperty('--mouse-x', `${spotlightCenterX}%`);
            elements.spotlight.style.setProperty('--mouse-y', `${spotlightCenterY}%`);
        } else {
            elements.spotlight.style.opacity = '0';
        }
    },

    handleMouseLeave() {
        this.resetToNeutralState();
    },

    resetToNeutralState() {
        const resetTransform = 'translate(0, 0)';
        elements.cardContainer.style.transform = 'rotateY(0deg) rotateX(0deg)';
        elements.background.style.transform = resetTransform;
        elements.content.style.transform = resetTransform;
        elements.spotlight.style.transform = resetTransform;
        elements.spotlight.style.opacity = '0';
        elements.profile.style.transform = resetTransform;
    },

    handleResize: utils.debounce(function() {
        Object.assign(state.card, {
            width: elements.cardContainer.offsetWidth,
            height: elements.cardContainer.offsetHeight
        });
        Object.assign(state.content, {
            width: elements.content.offsetWidth,
            height: elements.content.offsetHeight
        });
    }, 250),

    enable() {
        console.log('[CardParallax] Enabling parallax effect');
        this.isParallaxEnabled = true;
    },

    disable() {
        console.log('[CardParallax] Disabling parallax effect');
        this.isParallaxEnabled = false;
        this.resetToNeutralState();
    },

    init() {
        console.log('[CardParallax] Initializing');
        this.enable();
        elements.cardContainer.addEventListener('mousemove', this.handleMouseMove.bind(this));
        elements.cardContainer.addEventListener('mouseleave', this.handleMouseLeave.bind(this));
        window.addEventListener('resize', this.handleResize);
        this.handleResize();
    }
};

// Expose CardParallax globally
window.CardParallax = CardParallax;

// Initialize CardParallax
document.addEventListener('DOMContentLoaded', () => {
    window.CardParallax.init();
});