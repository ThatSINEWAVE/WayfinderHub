import { initTheme } from './theme.js';
import { initMap } from './map.js';
import { initContextMenu } from './context-menu.js';

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  const map = await initMap();
  initContextMenu(map);
});