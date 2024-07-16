htmx.defineExtension('transition', {
  onSwap: function(swapStyle) {
    return {
      swap: function(swapInfo) {
        const target = swapInfo.target;
        target.classList.add('htmx-swapping');
        setTimeout(() => {
          const newContent = swapInfo.serverResponse;
          swapInfo.settleInfo.elts.forEach(elt => {
            elt.classList.add('htmx-settling');
          });
          target.innerHTML = newContent;
          setTimeout(() => {
            target.classList.remove('htmx-swapping');
            swapInfo.settleInfo.elts.forEach(elt => {
              elt.classList.remove('htmx-settling');
            });
            swapInfo.settle();
          }, 300); // Match this to your CSS transition duration
        }, 300); // This creates the "out" transition
      }
    }
  }
});

// Handle initial load and browser back/forward
window.addEventListener('popstate', function() {
  const path = window.location.pathname;
  htmx.ajax('GET', path, '#dynamic-content');
});

// Intercept all HTMX requests
document.body.addEventListener('htmx:configRequest', function(evt) {
  // Remove _includes/pages from the URL and .html extension
  evt.detail.path = evt.detail.path.replace('_includes/pages/', '').replace('.html', '');
});

// After content is loaded
document.body.addEventListener('htmx:afterOnLoad', function(evt) {
  const activeIcon = document.querySelector('.menu-icon.active');
  if (activeIcon) activeIcon.classList.remove('active');
  
  const currentPath = window.location.pathname.slice(1) || 'home';
  const newActiveIcon = document.querySelector(`.menu-icon[data-title="${currentPath.charAt(0).toUpperCase() + currentPath.slice(1)}"]`);
  if (newActiveIcon) newActiveIcon.classList.add('active');
});