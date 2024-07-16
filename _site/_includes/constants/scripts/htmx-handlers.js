document.body.addEventListener('htmx:afterSwap', function(event) {
    // Update active menu dot
    document.querySelectorAll('.menu-icon').forEach(dot => {
        const dotPage = dot.getAttribute('data-title').toLowerCase();
        dot.classList.toggle('active', event.detail.pathInfo.requestPath.includes(dotPage));
    });

    // Fade in content
    const dynamicContent = document.getElementById('dynamic-content');
    dynamicContent.style.opacity = '0';
    setTimeout(() => {
        dynamicContent.style.opacity = '1';
    }, 50);
});

// Handle initial page load
document.addEventListener('DOMContentLoaded', function() {
    document.querySelector('.menu-icon[data-title="Home"]').click();
});