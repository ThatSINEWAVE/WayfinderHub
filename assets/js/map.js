import { showToast } from './toast.js';
import { updateMapTheme } from './theme.js';

async function initMap() {
  try {
    // First try to get approximate location from IP
    const ipResponse = await fetch('https://ipapi.co/json/');
    const ipData = await ipResponse.json();

    const userLat = ipData.latitude || 51.505;
    const userLng = ipData.longitude || -0.09;

    // Initialize the map
    const map = L.map('map', {
      zoomControl: false,
      fadeAnimation: false,
      zoomAnimation: false
    }).setView([userLat, userLng], 13);

    // Add tile layer with dark/light theme support
    const lightTiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
      crossOrigin: true
    });

    const darkTiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
      crossOrigin: true
    });

    // Add the appropriate tiles based on current theme
    if (document.documentElement.classList.contains('dark')) {
      darkTiles.addTo(map);
      document.getElementById('map').style.backgroundColor = '#0f172a';
    } else {
      lightTiles.addTo(map);
      document.getElementById('map').style.backgroundColor = '#f8fafc';
    }

    // Watch for theme changes
    const observer = new MutationObserver(() => {
      const isDark = document.documentElement.classList.contains('dark');
      updateMapTheme(isDark);
      if (isDark) {
        lightTiles.remove();
        darkTiles.addTo(map);
        document.getElementById('map').style.backgroundColor = '#0f172a';
      } else {
        darkTiles.remove();
        lightTiles.addTo(map);
        document.getElementById('map').style.backgroundColor = '#f8fafc';
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });

    // Add a scale control
    L.control.scale({ imperial: false }).addTo(map);

    // Custom zoom control with better styling
    const zoomControl = L.control.zoom({
      position: 'bottomright',
      zoomInText: '<i class="fas fa-plus"></i>',
      zoomOutText: '<i class="fas fa-minus"></i>'
    }).addTo(map);

    // Custom locate control
    const locateControl = L.Control.extend({
      options: {
        position: 'bottomright'
      },

      onAdd: function(map) {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
        const link = L.DomUtil.create('a', 'leaflet-control-locate', container);

        link.innerHTML = '<i class="fas fa-location-arrow"></i>';
        link.href = '#';
        link.title = 'Locate me';

        L.DomEvent.on(link, 'click', function(e) {
          L.DomEvent.stop(e);
          map.locate({setView: true, maxZoom: 15});
        });

        map.on('locationfound', function(e) {
          showToast(`Location found: ${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`);
        });

        map.on('locationerror', function(e) {
          showToast('Location access denied or unavailable');
        });

        return container;
      }
    });

    new locateControl().addTo(map);

    // Disable tile fade animation
    map.on('layeradd', (e) => {
      if (e.layer instanceof L.TileLayer) {
        e.layer.options.fadeAnimation = false;
      }
    });

    return map;

  } catch (error) {
    console.error('Error initializing map:', error);
    // Fallback to default location if IP lookup fails
    const map = L.map('map', {
      zoomControl: false,
      fadeAnimation: false,
      zoomAnimation: false
    }).setView([51.505, -0.09], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
      crossOrigin: true
    }).addTo(map);

    showToast('Could not determine your location. Using default.');
    return map;
  }
}

export { initMap };