document.addEventListener('DOMContentLoaded', function() {
    // Initialize the map with dark mode detection
    const map = L.map('map', {
        zoomControl: false,
        preferCanvas: true,
        attributionControl: false
    }).setView([0, 0], 2);

    // Store the current tile layer reference
    let currentTileLayer = null;
    let mapInitialized = false;

    // Add appropriate tile layer based on theme
    function updateMapTheme() {
        const isDark = document.documentElement.classList.contains('dark');

        // Remove all existing tile layers
        if (currentTileLayer) {
            map.removeLayer(currentTileLayer);
        }

        // Add new tile layer based on theme
        if (isDark) {
            currentTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
                maxZoom: 19,
                subdomains: 'abcd',
                className: 'carto-dark-tile'
            }).addTo(map);
        } else {
            currentTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                maxZoom: 19
            }).addTo(map);
        }

        // Invalidate size after a brief delay to ensure tiles are loaded
        setTimeout(() => {
            map.invalidateSize({ pan: false });
        }, 100);
    }

    // Initialize with current theme
    updateMapTheme();
    mapInitialized = true;

    // Variables to track markers and user location
    let userLocation = null;
    let userLocationMarker = null;
    let searchMarker = null;
    let searchHistory = [];

    // UI Elements
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const toggleSidebarBtn = document.getElementById('toggle-sidebar');
    const searchBox = document.getElementById('search-box');
    const searchResults = document.getElementById('search-results');
    const searchHistoryContainer = document.getElementById('search-history');
    const clearSearchBtn = document.getElementById('clear-search');
    const clearSearchHistoryBtn = document.getElementById('clear-search-history');
    const zoomInBtn = document.getElementById('zoom-in');
    const zoomOutBtn = document.getElementById('zoom-out');
    const centerMapBtn = document.getElementById('center-map');
    const removeMarkerBtn = document.getElementById('remove-marker');
    const loadingIndicator = document.getElementById('loading');
    const themeToggleBtn = document.getElementById('theme-toggle');

    // Theme Toggle Functionality
    themeToggleBtn.addEventListener('click', toggleTheme);

    function toggleTheme() {
        const html = document.documentElement;
        const isDark = html.classList.contains('dark');

        if (isDark) {
            html.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        } else {
            html.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        }

        // Update map theme when toggling
        updateMapTheme();
    }

    // Check for saved theme preference
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
    }

    // Sidebar Toggle Functionality
    toggleSidebarBtn.addEventListener('click', toggleSidebar);
    sidebarOverlay.addEventListener('click', toggleSidebar);

    function toggleSidebar() {
        const isOpen = sidebar.classList.toggle('open');
        sidebarOverlay.classList.toggle('visible', isOpen);
        toggleSidebarBtn.classList.toggle('active', isOpen);

        // Close search results when sidebar closes
        if (!isOpen) {
            searchResults.classList.add('hidden');
        }
    }

    // Search History Management
    function saveSearchToHistory(location) {
        const existingIndex = searchHistory.findIndex(item =>
            item.display_name === location.display_name
        );

        if (existingIndex !== -1) {
            searchHistory.splice(existingIndex, 1);
        }

        searchHistory.unshift(location);
        searchHistory = searchHistory.slice(0, 5);
        localStorage.setItem('searchHistory', JSON.stringify(searchHistory));
        renderSearchHistory();
    }

    function renderSearchHistory() {
        searchHistoryContainer.innerHTML = '';
        searchHistory.forEach(item => {
            const historyItem = document.createElement('div');
            historyItem.classList.add('bg-gray-100', 'dark:bg-gray-700', 'rounded-lg', 'p-3', 'flex', 'items-center', 'space-x-3', 'cursor-pointer', 'hover:bg-gray-200', 'dark:hover:bg-gray-600', 'transition');
            historyItem.innerHTML = `
                <i class="fas fa-history text-gray-500 dark:text-gray-400"></i>
                <div>
                    <p class="text-sm font-medium text-gray-700 dark:text-gray-200">${item.display_name.split(',')[0]}</p>
                    <small class="text-xs text-gray-500 dark:text-gray-400">${item.display_name.split(',').slice(1).join(',').trim()}</small>
                </div>
            `;
            historyItem.addEventListener('click', () => {
                handleSearchResultSelection(item);
            });
            searchHistoryContainer.appendChild(historyItem);
        });
    }

    // Clear search history functionality
    clearSearchHistoryBtn.addEventListener('click', () => {
        searchHistory = [];
        localStorage.removeItem('searchHistory');
        renderSearchHistory();
    });

    // Load search history from local storage
    const storedHistory = localStorage.getItem('searchHistory');
    if (storedHistory) {
        searchHistory = JSON.parse(storedHistory);
        renderSearchHistory();
    }

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
                getBrowserLocation();
            }
        })
        .catch(() => {
            getBrowserLocation();
        });

    // Function to get browser geolocation
    function getBrowserLocation(highAccuracy = false) {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    userLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };
                    map.setView([userLocation.lat, userLocation.lng], 14);
                    loadingIndicator.classList.add('hidden');

                    if (userLocationMarker) {
                        map.removeLayer(userLocationMarker);
                    }
                    userLocationMarker = L.circleMarker([userLocation.lat, userLocation.lng], {
                        radius: 8,
                        fillColor: "#3b82f6",
                        color: "#fff",
                        weight: 2,
                        opacity: 1,
                        fillOpacity: 0.8
                    }).addTo(map);
                },
                (error) => {
                    console.error("Geolocation error:", error);
                    handleGeolocationError(highAccuracy, error);
                }, {
                    enableHighAccuracy: highAccuracy,
                    timeout: highAccuracy ? 10000 : 5000,
                    maximumAge: highAccuracy ? 0 : 600000
                }
            );
        } else {
            console.log("Geolocation is not supported by this browser.");
            handleGeolocationError(highAccuracy);
        }
    }

    // Handle geolocation errors
    function handleGeolocationError(highAccuracy, error) {
        if (highAccuracy) {
            if (userLocation) {
                map.setView([userLocation.lat, userLocation.lng], 12);
            } else {
                userLocation = {
                    lat: 40.7128,
                    lng: -74.0060
                };
                map.setView([userLocation.lat, userLocation.lng], 12);
            }
        } else {
            userLocation = {
                lat: 40.7128,
                lng: -74.0060
            };
            map.setView([userLocation.lat, userLocation.lng], 12);
        }
        loadingIndicator.classList.add('hidden');
    }

    // Function to center map on user location
    function centerOnUserLocation() {
        loadingIndicator.classList.remove('hidden');
        getBrowserLocation(true);
        centerMapBtn.classList.add('locate-active');
        setTimeout(() => {
            centerMapBtn.classList.remove('locate-active');
            loadingIndicator.classList.add('hidden');
        }, 2000);
    }

    // Event listeners for map controls
    centerMapBtn.addEventListener('click', centerOnUserLocation);
    zoomInBtn.addEventListener('click', () => map.zoomIn());
    zoomOutBtn.addEventListener('click', () => map.zoomOut());

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

    // Debounce function
    function debounce(func, wait) {
        let timeout;
        return function() {
            const context = this,
                args = arguments;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), wait);
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
                    resultItem.tabIndex = 0;

                    const getLocationIcon = (type) => {
                        switch (type) {
                            case 'city':
                                return 'fas fa-city';
                            case 'village':
                                return 'fas fa-home';
                            case 'country':
                                return 'fas fa-globe';
                            case 'administrative':
                                return 'fas fa-map-marker-alt';
                            default:
                                return 'fas fa-map-pin';
                        }
                    };

                    const locationIcon = getLocationIcon(item.type);
                    const locationDetails = item.display_name.split(',');
                    const mainLocation = locationDetails[0];
                    const additionalInfo = locationDetails.slice(1).join(',').trim();

                    resultItem.innerHTML = `
                        <div class="search-result-icon">
                            <i class="${locationIcon}"></i>
                        </div>
                        <div class="search-result-details">
                            <strong>${mainLocation}</strong>
                            <small>${additionalInfo}</small>
                        </div>
                    `;

                    resultItem.addEventListener('click', (e) => {
                        e.preventDefault();
                        handleSearchResultSelection(item);
                    });

                    resultItem.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') handleSearchResultSelection(item);
                    });

                    searchResults.appendChild(resultItem);
                });
                searchResults.classList.remove('hidden');
            } else {
                searchResults.innerHTML = `<div class="no-results"><p>No results found for "${query}"</p><small>Try a different search term</small></div>`;
                searchResults.classList.remove('hidden');
            }
        } catch (error) {
            console.error('Search error:', error);
            searchResults.innerHTML = `<div class="no-results text-red-500"><p>Error fetching results</p><small>Please try again later</small></div>`;
            searchResults.classList.remove('hidden');
        }
    }

    // Handle search result selection
    function handleSearchResultSelection(item) {
        const lat = parseFloat(item.lat);
        const lng = parseFloat(item.lon);

        searchBox.value = item.display_name;
        searchResults.classList.add('hidden');
        toggleSidebar();

        map.flyTo([lat, lng], 14, {
            duration: 1,
            easeLinearity: 0.25
        });

        if (searchMarker) map.removeLayer(searchMarker);

        searchMarker = L.marker([lat, lng], {
            icon: L.divIcon({
                className: 'custom-marker',
                html: '<i class="fas fa-map-pin"></i>',
                iconSize: [24, 24]
            })
        }).addTo(map);

        saveSearchToHistory(item);
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
                if (item === document.activeElement) currentIndex = index;
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
            if (activeItem) activeItem.click();
        }
    });
});