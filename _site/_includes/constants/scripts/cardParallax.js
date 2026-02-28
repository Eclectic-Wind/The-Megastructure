import { elements } from "./elements.js";
import { config } from "./config.js";
import { utils } from "./utils.js";

const state = {
  card: {
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  },
  content: {
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    spotlightWidth: 0,
    spotlightHeight: 0,
    spotlightLeft: 0,
    spotlightTop: 0,
  },
  parallax: {
    currentX: 0,
    currentY: 0,
    targetX: 0,
    targetY: 0,
  },
};

export const CardParallax = {
  isParallaxEnabled: true,
  animationFrameId: null,
  latestMouseEvent: null,
  lastFrameTime: null,

  hasRequiredElements() {
    return Boolean(
      elements.cardContainer &&
        elements.background &&
        elements.contentContainer &&
        elements.content &&
        elements.spotlight &&
        elements.profile
    );
  },

  setParallaxActive(isActive) {
    if (!elements.cardContainer) {
      return;
    }

    elements.cardContainer.classList.toggle("parallax-active", isActive);
  },

  startAnimationLoop() {
    if (this.animationFrameId !== null) {
      return;
    }

    this.animationFrameId = window.requestAnimationFrame((timestamp) => {
      this.animationTick(timestamp);
    });
  },

  animationTick(timestamp) {
    this.animationFrameId = null;

    if (!this.isParallaxEnabled || !this.hasRequiredElements()) {
      this.lastFrameTime = null;
      return;
    }

    const baseSmoothing = config.parallax.smoothingFactor ?? 0.14;
    const previousFrame = this.lastFrameTime ?? timestamp;
    const deltaMs = Math.min(34, Math.max(0, timestamp - previousFrame));
    const frameScale = deltaMs / 16.6667;
    const smoothingFactor =
      1 - Math.pow(1 - baseSmoothing, frameScale > 0 ? frameScale : 1);

    this.lastFrameTime = timestamp;

    const settleThreshold = 0.0008;
    const { parallax } = state;

    parallax.currentX += (parallax.targetX - parallax.currentX) * smoothingFactor;
    parallax.currentY += (parallax.targetY - parallax.currentY) * smoothingFactor;

    this.renderParallax(parallax.currentX, parallax.currentY);

    const deltaX = Math.abs(parallax.targetX - parallax.currentX);
    const deltaY = Math.abs(parallax.targetY - parallax.currentY);

    if (deltaX > settleThreshold || deltaY > settleThreshold) {
      this.startAnimationLoop();
    }
  },

  updateParallaxTarget(e) {
    const { left, top, width: cardWidth, height: cardHeight } = state.card;

    if (!cardWidth || !cardHeight) {
      return;
    }

    const mouseX = e.clientX - left;
    const mouseY = e.clientY - top;
    const multiplier = config.parallax.multiplier;

    state.parallax.targetX = ((mouseX - cardWidth / 2) * multiplier) / cardWidth;
    state.parallax.targetY = ((mouseY - cardHeight / 2) * multiplier) / cardHeight;
  },

  renderParallax(mousePX, mousePY) {
    const {
      rotationFactor,
      backgroundMoveFactor,
      contentMoveFactor,
      profileMoveFactor,
    } = config.parallax;

    const rotateX = mousePX * rotationFactor;
    const rotateY = mousePY * -rotationFactor;

    elements.cardContainer.style.transform = `rotateY(${rotateX}deg) rotateX(${rotateY}deg)`;
    elements.background.style.transform = `translate3d(${mousePX * backgroundMoveFactor}px, ${mousePY * backgroundMoveFactor}px, 0)`;

    const contentTransform = `translate3d(${mousePX * contentMoveFactor}px, ${mousePY * contentMoveFactor}px, 0)`;
    elements.content.style.transform = contentTransform;

    elements.profile.style.transform = `translate3d(${mousePX * profileMoveFactor}px, ${mousePY * profileMoveFactor}px, 0)`;
  },

  handleMouseMove(e) {
    if (!this.isParallaxEnabled || !this.hasRequiredElements()) {
      return;
    }

    this.setParallaxActive(true);
    this.latestMouseEvent = e;

    this.updateParallaxTarget(e);
    this.updateContentSpotlight(e);
    this.startAnimationLoop();
  },

  configureSpotlightBox() {
    if (!elements.content || !elements.contentContainer || !elements.spotlight) {
      return;
    }

    const contentRect = elements.content.getBoundingClientRect();
    const containerRect = elements.contentContainer.getBoundingClientRect();

    if (!contentRect.width || !contentRect.height) {
      return;
    }

    const spotlightWidth = contentRect.width * config.parallax.spotlightSizeIncrease;
    const spotlightHeight = contentRect.height * config.parallax.spotlightSizeIncrease;
    const leftOffset = (spotlightWidth - contentRect.width) / 2;
    const topOffset = (spotlightHeight - contentRect.height) / 2;

    Object.assign(state.content, {
      left: contentRect.left - containerRect.left,
      top: contentRect.top - containerRect.top,
      width: contentRect.width,
      height: contentRect.height,
      spotlightWidth,
      spotlightHeight: spotlightHeight + 50,
      spotlightLeft: contentRect.left - containerRect.left - leftOffset,
      spotlightTop: contentRect.top - containerRect.top - topOffset - 70,
    });

    Object.assign(elements.spotlight.style, {
      left: `${state.content.spotlightLeft}px`,
      top: `${state.content.spotlightTop}px`,
      width: `${state.content.spotlightWidth}px`,
      height: `${state.content.spotlightHeight}px`,
    });
  },

  updateContentSpotlight(e) {
    if (!elements.content || !elements.spotlight) {
      return;
    }

    const contentRect = elements.content.getBoundingClientRect();

    if (!contentRect.width || !contentRect.height) {
      return;
    }

    const mousePos = {
      x: e.clientX - contentRect.left,
      y: e.clientY - contentRect.top,
    };
    const relativeMouseX = mousePos.x;
    const relativeMouseY = mousePos.y;

    if (
      relativeMouseX >= 0 &&
      relativeMouseX <= contentRect.width &&
      relativeMouseY >= 0 &&
      relativeMouseY <= contentRect.height
    ) {
      const spotlightCenterX = (relativeMouseX / contentRect.width) * 100;
      const spotlightCenterY = (relativeMouseY / contentRect.height) * 100;

      elements.spotlight.style.opacity = "1";
      elements.spotlight.style.setProperty("--mouse-x", `${spotlightCenterX}%`);
      elements.spotlight.style.setProperty("--mouse-y", `${spotlightCenterY}%`);
      return;
    }

    elements.spotlight.style.opacity = "0";
  },

  handleMouseLeave() {
    this.setParallaxActive(false);
    this.latestMouseEvent = null;
    this.lastFrameTime = null;

    state.parallax.targetX = 0;
    state.parallax.targetY = 0;
    state.parallax.currentX = 0;
    state.parallax.currentY = 0;

    if (this.animationFrameId !== null) {
      window.cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    this.resetToNeutralState();
  },

  resetToNeutralState() {
    if (!this.hasRequiredElements()) {
      return;
    }

    const resetTransform = "translate3d(0, 0, 0)";

    elements.cardContainer.style.transform = "rotateY(0deg) rotateX(0deg)";
    elements.background.style.transform = resetTransform;
    elements.content.style.transform = resetTransform;
    elements.spotlight.style.transform = resetTransform;
    elements.spotlight.style.opacity = "0";
    elements.profile.style.transform = resetTransform;
  },

  handleResize: utils.debounce(function () {
    if (!CardParallax.hasRequiredElements()) {
      return;
    }

    const cardRect = elements.cardContainer.getBoundingClientRect();

    Object.assign(state.card, {
      left: cardRect.left,
      top: cardRect.top,
      width: cardRect.width,
      height: cardRect.height,
    });

    CardParallax.configureSpotlightBox();
  }, 250),

  enable() {
    this.isParallaxEnabled = true;
  },

  disable() {
    this.isParallaxEnabled = false;
    this.setParallaxActive(false);
    this.resetToNeutralState();
  },

  init() {
    if (!this.hasRequiredElements()) {
      console.warn("[CardParallax] Required elements missing; init skipped");
      return;
    }

    this.enable();

    elements.cardContainer.addEventListener(
      "pointermove",
      this.handleMouseMove.bind(this),
      { passive: true }
    );
    elements.cardContainer.addEventListener(
      "pointerleave",
      this.handleMouseLeave.bind(this)
    );

    window.addEventListener("resize", this.handleResize);
    this.handleResize();
  },
};

window.CardParallax = CardParallax;
