/**
 * Initializes a custom context menu for the Leaflet map.
 * @param {L.Map} map - The Leaflet map instance.
 * @param {object} appControls - Object containing references to app functions.
 */
function initializeContextMenu(map, appControls) {
    const contextMenuElement = document.getElementById('custom-context-menu');
    if (!contextMenuElement) {
        console.error("Context menu element not found in DOM.");
        return;
    }

    let clickedLatLng = null;
    let measuringState = 'idle'; // 'idle', 'measuring', 'showing_result'
    let measuredPoints = [];
    let measurementLayer = null;
    let tempMarker = null;
    let tempLine = null;
    let mainPolyline = null;
    let pointMarkers = [];

    const MARKER_OPTIONS = {
        start: {
            radius: 7,
            fillColor: "#2563eb",
            color: "#ffffff",
            weight: 2,
            opacity: 1,
            fillOpacity: 0.9
        },
        intermediate: {
            radius: 6,
            fillColor: "#f97316",
            color: "#ffffff",
            weight: 2,
            opacity: 1,
            fillOpacity: 0.9
        },
        temp: {
            radius: 6,
            fillColor: "#f97316",
            color: "#ffffff",
            weight: 2,
            opacity: 0.7,
            fillOpacity: 0.7
        }
    };

    const LINE_OPTIONS = {
        main: {
            color: '#f97316',
            weight: 4,
            opacity: 0.9,
            className: 'measurement-line'
        },
        temp: {
            color: '#f97316',
            weight: 3,
            opacity: 0.7,
            dashArray: '5, 5',
            className: 'measurement-line'
        }
    };

    // Menu Item Creation
    const createMenuItem = (text, iconClass, callback, disabled = false) => {
        const item = document.createElement('button');
        item.className = 'context-menu-item';
        item.disabled = disabled;
        item.innerHTML = `
            <i class="${iconClass}"></i>
            <span>${text}</span>
        `;
        if (!disabled) {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                callback();
                hideContextMenu();
            });
        }
        return item;
    };

    const createDivider = () => {
        const divider = document.createElement('div');
        divider.className = 'context-menu-divider';
        return divider;
    };

    // Menu Display Logic
    const showContextMenu = (event) => {
        clickedLatLng = event.latlng;
        const point = event.originalEvent;

        if (measuringState === 'measuring') {
            addMeasurementPoint(event);
            return;
        }

        contextMenuElement.innerHTML = '';

        // Standard menu items
        contextMenuElement.appendChild(createMenuItem('Center here', 'fas fa-crosshairs', () => map.flyTo(clickedLatLng)));
        contextMenuElement.appendChild(createMenuItem('Zoom in', 'fas fa-search-plus', () => map.zoomIn()));
        contextMenuElement.appendChild(createMenuItem('Zoom out', 'fas fa-search-minus', () => map.zoomOut()));

        contextMenuElement.appendChild(createDivider());

        // Measurement items
        if (measuringState === 'idle') {
            contextMenuElement.appendChild(
                createMenuItem('Measure distance', 'fas fa-ruler-horizontal', startMeasurement)
            );
        } else if (measuringState === 'measuring') {
            contextMenuElement.appendChild(
                createMenuItem('Finish measurement', 'fas fa-check', finishMeasurement)
            );
            contextMenuElement.appendChild(
                createMenuItem('Cancel measurement', 'fas fa-times', cancelMeasurement)
            );
        } else if (measuringState === 'showing_result') {
            contextMenuElement.appendChild(
                createMenuItem('Clear measurement', 'fas fa-trash-alt', clearMeasurement)
            );
        }

        positionMenu(point.clientX, point.clientY);
        contextMenuElement.classList.remove('hidden');
    };

    const positionMenu = (x, y) => {
        const menuWidth = contextMenuElement.offsetWidth;
        const menuHeight = contextMenuElement.offsetHeight;
        const buffer = 10;

        let finalX = Math.min(x, window.innerWidth - menuWidth - buffer);
        let finalY = Math.min(y, window.innerHeight - menuHeight - buffer);

        contextMenuElement.style.left = `${Math.max(buffer, finalX)}px`;
        contextMenuElement.style.top = `${Math.max(buffer, finalY)}px`;
    };

    const hideContextMenu = () => {
        contextMenuElement.classList.add('hidden');
    };

    // Measurement Logic
    const startMeasurement = () => {
        clearMeasurement();
        measuringState = 'measuring';
        measuredPoints = [clickedLatLng];

        // Create measurement layer if it doesn't exist
        if (!measurementLayer) {
            measurementLayer = L.layerGroup().addTo(map);
        }

        // Add start marker
        const startMarker = L.circleMarker(clickedLatLng, MARKER_OPTIONS.start)
            .bindTooltip("Start point", {
                permanent: true,
                direction: 'top',
                className: 'measurement-tooltip'
            })
            .addTo(measurementLayer);
        pointMarkers.push(startMarker);

        // Setup temporary marker and line
        tempMarker = L.circleMarker(clickedLatLng, MARKER_OPTIONS.temp).addTo(measurementLayer);
        tempLine = L.polyline([clickedLatLng, clickedLatLng], LINE_OPTIONS.temp).addTo(measurementLayer);

        // Set map cursor and bind events
        map.getContainer().style.cursor = 'crosshair';
        map.on('mousemove', updateMeasurementLine);
        document.addEventListener('keydown', handleMeasurementKeydown);
    };

    const updateMeasurementLine = (e) => {
        if (!tempMarker || !tempLine || measuredPoints.length === 0) return;

        const currentLatLng = e.latlng;
        const lastPoint = measuredPoints[measuredPoints.length - 1];

        // Update temporary marker and line
        tempMarker.setLatLng(currentLatLng);
        tempLine.setLatLngs([lastPoint, currentLatLng]);

        // Update tooltip with distance
        const distance = map.distance(lastPoint, currentLatLng);
        tempMarker.bindTooltip(`Distance: ${formatDistance(distance)}`, {
            permanent: true,
            direction: 'top',
            className: 'measurement-tooltip'
        }).openTooltip();
    };

    const addMeasurementPoint = (e) => {
        if (measuringState !== 'measuring') return;

        const newPoint = e.latlng;
        measuredPoints.push(newPoint);

        // Add intermediate marker
        const marker = L.circleMarker(newPoint, MARKER_OPTIONS.intermediate)
            .addTo(measurementLayer);
        pointMarkers.push(marker);

        // Update or create main polyline
        if (!mainPolyline) {
            mainPolyline = L.polyline(measuredPoints, LINE_OPTIONS.main).addTo(measurementLayer);
        } else {
            mainPolyline.setLatLngs(measuredPoints);
        }

        // Update temporary line start point
        if (tempLine) {
            tempLine.setLatLngs([newPoint, newPoint]);
        }

        // Update total distance tooltip
        updateTotalDistanceTooltip();
    };

    const finishMeasurement = () => {
        if (measuredPoints.length < 2) {
            clearMeasurement();
            return;
        }

        measuringState = 'showing_result';
        cleanupMeasurementListeners();

        // Remove temporary elements
        if (tempMarker) measurementLayer.removeLayer(tempMarker);
        if (tempLine) measurementLayer.removeLayer(tempLine);
        tempMarker = null;
        tempLine = null;

        // Add final total distance tooltip
        updateTotalDistanceTooltip(true);

        // Reset cursor
        map.getContainer().style.cursor = '';
    };

    const updateTotalDistanceTooltip = (permanent = false) => {
        if (!mainPolyline || measuredPoints.length < 2) return;

        const totalDistance = calculateTotalDistance();
        const center = mainPolyline.getBounds().getCenter();

        mainPolyline.unbindTooltip();
        mainPolyline.bindTooltip(`Total: ${formatDistance(totalDistance)}`, {
            permanent: permanent,
            direction: 'center',
            className: 'measurement-tooltip measurement-tooltip-total'
        }).openTooltip(center);
    };

    const calculateTotalDistance = () => {
        let total = 0;
        for (let i = 1; i < measuredPoints.length; i++) {
            total += map.distance(measuredPoints[i - 1], measuredPoints[i]);
        }
        return total;
    };

    const formatDistance = (meters) => {
        if (meters >= 1000) {
            return (meters / 1000).toFixed(meters >= 10000 ? 1 : 2) + ' km';
        }
        return meters.toFixed(0) + ' m';
    };

    const handleMeasurementKeydown = (e) => {
        if (e.key === 'Escape') {
            if (measuringState === 'measuring') {
                finishMeasurement();
            } else {
                clearMeasurement();
            }
            hideContextMenu();
        } else if (e.key === 'Enter' && measuringState === 'measuring') {
            finishMeasurement();
            hideContextMenu();
        }
    };

    const cleanupMeasurementListeners = () => {
        map.off('mousemove', updateMeasurementLine);
        document.removeEventListener('keydown', handleMeasurementKeydown);
    };

    const cancelMeasurement = () => {
        clearMeasurement();
    };

    const clearMeasurement = () => {
        if (measurementLayer) {
            measurementLayer.clearLayers();
        }
        measuredPoints = [];
        pointMarkers = [];
        mainPolyline = null;
        tempMarker = null;
        tempLine = null;
        measuringState = 'idle';
        map.getContainer().style.cursor = '';
        cleanupMeasurementListeners();
    };

    // Event Listeners
    map.on('contextmenu', showContextMenu);

    map.on('click zoomstart dragstart', () => {
        if (measuringState !== 'measuring') {
            hideContextMenu();
        }
    });

    document.addEventListener('click', (e) => {
        if (!map.getContainer().contains(e.target) && !contextMenuElement.contains(e.target)) {
            hideContextMenu();
        }
    });
}