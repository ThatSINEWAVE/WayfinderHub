import { showToast } from './toast.js';

let contextMenuLatLng = null;
let currentRoute = null;
let routePoints = [];
let routePolyline = null;
let routeMarkers = [];
let map = null;

function initContextMenu(mapInstance) {
  map = mapInstance;
  const contextMenu = document.getElementById('context-menu');

  // Hide context menu when clicking elsewhere
  document.addEventListener('click', (e) => {
    if (!contextMenu.contains(e.target)) {
      contextMenu.classList.add('hidden');
    }
  });

  // Prevent default context menu on map
  map.getContainer().addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });

  // Right-click handler for map
  map.on('contextmenu', (e) => {
    e.originalEvent.preventDefault();
    contextMenuLatLng = e.latlng;

    // Position the context menu
    const container = map.getContainer();
    const containerRect = container.getBoundingClientRect();
    const x = e.originalEvent.clientX - containerRect.left;
    const y = e.originalEvent.clientY - containerRect.top;

    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;
    contextMenu.classList.remove('hidden');

    // Update menu items based on route state
    const startRouteItem = contextMenu.querySelector('[data-action="start-route"]');
    const addToRouteItem = contextMenu.querySelector('[data-action="add-to-route"]');
    const finishRouteItem = contextMenu.querySelector('[data-action="finish-route"]');
    const clearRouteItem = contextMenu.querySelector('[data-action="clear-route"]');

    if (currentRoute === null) {
      startRouteItem.style.display = 'block';
      addToRouteItem.style.display = 'none';
      finishRouteItem.style.display = 'none';
      clearRouteItem.style.display = 'none';
    } else {
      startRouteItem.style.display = 'none';
      addToRouteItem.style.display = 'block';
      finishRouteItem.style.display = routePoints.length > 1 ? 'block' : 'none';
      clearRouteItem.style.display = 'block';
    }
  });

  // Context menu item click handler
  document.querySelectorAll('.context-menu-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      contextMenu.classList.add('hidden');

      if (!contextMenuLatLng) return;

      const action = item.getAttribute('data-action');
      const { lat, lng } = contextMenuLatLng;

      handleContextMenuAction(action, lat, lng);
    });
  });

  // Handle marker dragging for route points
  map.on('drag', (e) => {
    if (routeMarkers.includes(e.target)) {
      const index = routeMarkers.indexOf(e.target);
      routePoints[index] = e.target.getLatLng();
      updateRoutePolyline();
    }
  });
}

function handleContextMenuAction(action, lat, lng) {
  const customIcon = L.icon({
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    shadowSize: [41, 41]
  });

  const routeIcon = L.icon({
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    shadowSize: [41, 41]
  });

  switch (action) {
    case 'add-marker':
      const marker = L.marker([lat, lng], { icon: customIcon }).addTo(map);
      marker.bindPopup(`
        <div class="space-y-2">
          <h3 class="font-bold">Marker</h3>
          <p>Latitude: ${lat.toFixed(6)}</p>
          <p>Longitude: ${lng.toFixed(6)}</p>
          <button class="px-3 py-1 bg-primary-600 text-white rounded hover:bg-primary-700 transition remove-marker">
            Remove
          </button>
        </div>
      `);

      marker.on('popupopen', () => {
        document.querySelector('.remove-marker')?.addEventListener('click', () => {
          map.removeLayer(marker);
        });
      });
      break;

    case 'start-route':
      if (currentRoute) {
        clearRoute();
      }
      currentRoute = true;
      routePoints = [contextMenuLatLng];

      // Add start marker
      const startMarker = L.marker([lat, lng], {
        icon: routeIcon,
        draggable: true
      }).addTo(map);

      startMarker.bindPopup(`
        <div class="space-y-2">
          <h3 class="font-bold">Route Start</h3>
          <p>Latitude: ${lat.toFixed(6)}</p>
          <p>Longitude: ${lng.toFixed(6)}</p>
        </div>
      `);

      routeMarkers.push(startMarker);
      showToast('Route started. Right-click to add more points.');
      break;

    case 'add-to-route':
      if (currentRoute && routePoints.length > 0) {
        routePoints.push(contextMenuLatLng);

        // Add waypoint marker
        const waypointMarker = L.marker([lat, lng], {
          icon: routeIcon,
          draggable: true
        }).addTo(map);

        waypointMarker.bindPopup(`
          <div class="space-y-2">
            <h3 class="font-bold">Route Point ${routePoints.length - 1}</h3>
            <p>Latitude: ${lat.toFixed(6)}</p>
            <p>Longitude: ${lng.toFixed(6)}</p>
          </div>
        `);

        routeMarkers.push(waypointMarker);
        updateRoutePolyline();
        showToast('Point added to route.');
      }
      break;

    case 'finish-route':
      if (currentRoute && routePoints.length > 1) {
        routePoints.push(contextMenuLatLng);

        // Add end marker
        const endMarker = L.marker([lat, lng], {
          icon: routeIcon,
          draggable: true
        }).addTo(map);

        endMarker.bindPopup(`
          <div class="space-y-2">
            <h3 class="font-bold">Route End</h3>
            <p>Latitude: ${lat.toFixed(6)}</p>
            <p>Longitude: ${lng.toFixed(6)}</p>
          </div>
        `);

        routeMarkers.push(endMarker);
        updateRoutePolyline();
        showToast(`Route completed with ${routePoints.length} points.`);
        currentRoute = false; // Route is now complete
      } else {
        showToast('Route needs at least 2 points to finish.');
      }
      break;

    case 'clear-route':
      clearRoute();
      showToast('Route cleared.');
      break;

    case 'center-map':
      map.setView([lat, lng], map.getZoom());
      break;

    case 'copy-coords':
      navigator.clipboard.writeText(`${lat.toFixed(6)}, ${lng.toFixed(6)}`)
        .then(() => showToast('Coordinates copied to clipboard'))
        .catch(() => showToast('Failed to copy coordinates'));
      break;
  }
}

function updateRoutePolyline() {
  if (routePolyline) {
    map.removeLayer(routePolyline);
  }

  if (routePoints.length > 1) {
    routePolyline = L.polyline(routePoints, {
      color: '#3b82f6',
      weight: 4,
      opacity: 0.7,
      dashArray: '5, 5',
      lineJoin: 'round'
    }).addTo(map);
  }
}

function clearRoute() {
  if (routePolyline) {
    map.removeLayer(routePolyline);
    routePolyline = null;
  }

  routeMarkers.forEach(marker => map.removeLayer(marker));
  routeMarkers = [];
  routePoints = [];
  currentRoute = null;
}

export { initContextMenu };