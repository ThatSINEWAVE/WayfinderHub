document.addEventListener('DOMContentLoaded', function() {
    // Initialize the map
    const map = L.map('map').setView([0, 0], 2);

    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);

    // Variables to track markers and user location
    let userLocation = null;
    let userLocationMarker = null;
    let searchMarker = null;
    let geocoder;

    // UI Elements
    const searchBox = document.getElementById('search-box');
    const searchResults = document.getElementById('search-results');
    const clearSearchBtn = document.getElementById('clear-search');
    const locateBtn = document.getElementById('locate-btn');
    const zoomInBtn = document.getElementById('zoom-in');
    const zoomOutBtn = document.getElementById('zoom-out');
    const centerMapBtn = document.getElementById('center-map');
    const removeMarkerBtn = document.getElementById('remove-marker');
    const loadingIndicator = document.getElementById('loading');

    // Initialize the loading indicator
    loadingIndicator.classList.remove('hidden');

    // Try to get user's location from IP first, then fall back to browser geolocation
    fetch('https://ipapi.co/json/')
        .then(response => response.json())
        .then(data => {
            if (data.latitude && data.longitude) {
                userLocation = {
                    lat: parseFloat(data.latitude),
                    lng: parseFloat(data.longitude)
                };
                map.setView([userLocation.lat, userLocation.lng], 12);
                loadingIndicator.classList.add('hidden');
            } else {
                // Fall back to browser geolocation if IP lookup fails
                getBrowserLocation();
            }
        })
        .catch(() => {
            // If IP lookup fails, use browser geolocation
            getBrowserLocation();
        });

    // Function to get browser geolocation
    function getBrowserLocation() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    userLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };
                    map.setView([userLocation.lat, userLocation.lng], 12);
                    loadingIndicator.classList.add('hidden');
                },
                (error) => {
                    console.error("Geolocation error:", error);
                    // Default to a known location if geolocation fails
                    userLocation = { lat: 40.7128, lng: -74.0060 }; // New York
                    map.setView([userLocation.lat, userLocation.lng], 12);
                    loadingIndicator.classList.add('hidden');
                }
            );
        } else {
            console.log("Geolocation is not supported by this browser.");
            // Default to a known location
            userLocation = { lat: 40.7128, lng: -74.0060 }; // New York
            map.setView([userLocation.lat, userLocation.lng], 12);
            loadingIndicator.classList.add('hidden');
        }
    }

    // Function to center map on user location
    function centerOnUserLocation() {
        if (userLocation) {
            map.flyTo([userLocation.lat, userLocation.lng], 14, {
                duration: 1,
                easeLinearity: 0.25
            });

            // Add a pulsing effect to the locate button
            locateBtn.classList.add('locate-active');
            setTimeout(() => {
                locateBtn.classList.remove('locate-active');
            }, 2000);

            // Add a temporary marker if one doesn't exist
            if (!userLocationMarker) {
                userLocationMarker = L.circleMarker([userLocation.lat, userLocation.lng], {
                    radius: 8,
                    fillColor: "#3b82f6",
                    color: "#fff",
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.8
                }).addTo(map);

                // Remove the marker after 5 seconds
                setTimeout(() => {
                    if (userLocationMarker) {
                        map.removeLayer(userLocationMarker);
                        userLocationMarker = null;
                    }
                }, 5000);
            }
        } else {
            alert("Your location is not available. Please try again later.");
        }
    }

    // Event listeners for map controls
    locateBtn.addEventListener('click', centerOnUserLocation);

    zoomInBtn.addEventListener('click', () => {
        map.zoomIn();
    });

    zoomOutBtn.addEventListener('click', () => {
        map.zoomOut();
    });

    centerMapBtn.addEventListener('click', () => {
        if (searchMarker) {
            map.flyTo(searchMarker.getLatLng(), map.getZoom());
        } else if (userLocation) {
            map.flyTo([userLocation.lat, userLocation.lng], map.getZoom());
        }
    });

    removeMarkerBtn.addEventListener('click', () => {
        if (searchMarker) {
            map.removeLayer(searchMarker);
            searchMarker = null;
            removeMarkerBtn.classList.add('hidden');
        }
    });

    // Clear search button
    clearSearchBtn.addEventListener('click', () => {
        searchBox.value = '';
        searchResults.classList.add('hidden');
        clearSearchBtn.classList.add('hidden');
    });

    // Search box functionality
    searchBox.addEventListener('input', debounce(handleSearchInput, 300));

    searchBox.addEventListener('focus', () => {
        if (searchBox.value.trim() !== '') {
            searchResults.classList.remove('hidden');
        }
    });

    document.addEventListener('click', (e) => {
        if (!searchBox.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.classList.add('hidden');
        }
    });

    // Debounce function to limit API calls during typing
    function debounce(func, wait) {
        let timeout;
        return function() {
            const context = this, args = arguments;
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                func.apply(context, args);
            }, wait);
        };
    }

    // Handle search input
    async function handleSearchInput() {
        const query = searchBox.value.trim();

        if (query === '') {
            searchResults.classList.add('hidden');
            clearSearchBtn.classList.add('hidden');
            return;
        }

        clearSearchBtn.classList.remove('hidden');

        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`);
            const data = await response.json();

            if (data.length > 0) {
                searchResults.innerHTML = '';
                data.forEach(item => {
                    const resultItem = document.createElement('a');
                    resultItem.href = '#';
                    resultItem.innerHTML = `<strong>${item.display_name}</strong>`;
                    resultItem.addEventListener('click', (e) => {
                        e.preventDefault();
                        handleSearchResultSelection(item);
                    });
                    searchResults.appendChild(resultItem);
                });
                searchResults.classList.remove('hidden');
            } else {
                searchResults.innerHTML = '<div class="p-3 text-gray-500">No results found</div>';
                searchResults.classList.remove('hidden');
            }
        } catch (error) {
            console.error('Search error:', error);
            searchResults.innerHTML = '<div class="p-3 text-red-500">Error fetching results</div>';
            searchResults.classList.remove('hidden');
        }
    }

    // Handle search result selection
    function handleSearchResultSelection(item) {
        const lat = parseFloat(item.lat);
        const lng = parseFloat(item.lon);

        // Close search results
        searchBox.value = item.display_name;
        searchResults.classList.add('hidden');

        // Fly to the selected location
        map.flyTo([lat, lng], 14, {
            duration: 1,
            easeLinearity: 0.25
        });

        // Remove any existing search marker
        if (searchMarker) {
            map.removeLayer(searchMarker);
        }

        // Add a new marker
        searchMarker = L.marker([lat, lng], {
            icon: L.divIcon({
                className: 'custom-marker',
                html: '<i class="fas fa-map-pin"></i>'
            })
        }).addTo(map);

        // Show the remove marker button
        removeMarkerBtn.classList.remove('hidden');
    }

    // Handle keyboard navigation in search results
    searchBox.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const items = searchResults.querySelectorAll('a');
            if (items.length === 0) return;

            let currentIndex = -1;
            items.forEach((item, index) => {
                if (item === document.activeElement) {
                    currentIndex = index;
                }
            });

            if (e.key === 'ArrowDown') {
                const nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
                items[nextIndex].focus();
            } else if (e.key === 'ArrowUp') {
                const prevIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
                items[prevIndex].focus();
            }
        } else if (e.key === 'Enter') {
            const activeItem = searchResults.querySelector('a:focus');
            if (activeItem) {
                activeItem.click();
            }
        }
    });
});