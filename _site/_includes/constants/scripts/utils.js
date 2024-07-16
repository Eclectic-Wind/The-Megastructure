export const utils = {
    calculateMousePosition(e, element) {
        const rect = element.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    },
    isPointInRect(point, rect) {
        return point.x >= 0 && point.x <= rect.width && point.y >= 0 && point.y <= rect.height;
    },
    debounce(func, wait) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), wait);
        };
    }
};