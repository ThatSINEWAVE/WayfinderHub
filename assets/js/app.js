document.addEventListener('DOMContentLoaded', function() {
    // --- Constants ---
    const DEFAULT_LAT = 20;
    const DEFAULT_LNG = 0;
    const DEFAULT_ZOOM = 3;
    const GEOLOCATION_ZOOM = 14;
    const SEARCH_FLY_ZOOM = 15;
    const SEARCH_DEBOUNCE_MS = 350;
    const TILE_LAYER_OPTIONS = {
        maxZoom: 19,
        attribution: ''
    };
    const LIGHT_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    const LIGHT_TILE_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OSM</a> contributors';
    const DARK_TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    const DARK_TILE_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OSM</a> contributors © <a href="https://carto.com/attributions" target="_blank" rel="noopener noreferrer">CARTO</a>';

    // --- Global Variables ---
    let map = null;
    let currentTileLayer = null;
    let userLocation = null;
    let userLocationMarker = null;
    let searchMarker = null;
    let searchHistory = [];
    let resizeTimeout;
    let nominatimXHR = null;

    // --- DOM Elements ---
    const appHeader = document.getElementById('app-header');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const toggleSidebarBtn = document.getElementById('toggle-sidebar');
    const searchBox = document.getElementById('search-box');
    const searchResultsContainer = document.getElementById('search-results');
    const searchHistoryContainer = document.getElementById('search-history');
    const clearSearchBtn = document.getElementById('clear-search');
    const clearSearchHistoryBtn = document.getElementById('clear-search-history');
    const noHistoryMessage = document.getElementById('no-history-message');
    const zoomInBtn = document.getElementById('zoom-in');
    const zoomOutBtn = document.getElementById('zoom-out');
    const centerMapBtn = document.getElementById('center-map');
    const removeMarkerBtn = document.getElementById('remove-marker');
    const themeToggleBtn = document.getElementById('theme-toggle');
    const mapContainer = document.getElementById('map');
    const loadingIndicator = document.getElementById('loading');
    const loadingText = document.getElementById('loading-text');

    // --- Utility Functions ---
    const showLoading = (text = "Loading...") => {
        loadingText.textContent = text;
        loadingIndicator.classList.remove('hidden');
        loadingIndicator.classList.add('opacity-100');
    };

    const hideLoading = () => {
        setTimeout(() => {
            loadingIndicator.classList.add('hidden');
            loadingIndicator.classList.remove('opacity-100');
        }, 200);
    };

    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func.apply(this, args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // --- Initial Setup ---
    const applyInitialTheme = () => {
        const savedTheme = localStorage.getItem('theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    };

    const initializeMap = () => {
        showLoading("Initializing Map...");
        map = L.map(mapContainer, {
            zoomControl: false,
            preferCanvas: true,
            attributionControl: false
        }).setView([DEFAULT_LAT, DEFAULT_LNG], DEFAULT_ZOOM);

        updateMapTheme(true);

        L.control.attribution({
            position: 'bottomright',
            prefix: false
        }).addTo(map);
        updateAttribution();

        updateMapPadding();

        if (typeof initializeContextMenu === 'function') {
            initializeContextMenu(map, { showLoading });
        } else {
            console.error("initializeContextMenu function not found. Ensure context-menu.js is loaded correctly.");
        }

        zoomInBtn.addEventListener('click', () => map.zoomIn());
        zoomOutBtn.addEventListener('click', () => map.zoomOut());
        centerMapBtn.addEventListener('click', centerOnUserLocation);
        removeMarkerBtn.addEventListener('click', removeSearchMarker);

        window.addEventListener('resize', debounce(() => {
            updateMapPadding();
            if (map) map.invalidateSize();
        }, 250));

        getUserLocation();
    };

    const updateMapPadding = () => {
        const headerHeight = appHeader?.offsetHeight || 56;
        mapContainer.style.paddingTop = `${headerHeight}px`;
    };

    // --- Theme Management ---
    const updateMapTheme = (isInitialLoad = false) => {
        if (!map) return;

        const isDark = document.documentElement.classList.contains('dark');
        const newTileUrl = isDark ? DARK_TILE_URL : LIGHT_TILE_URL;

        const tileOptions = { ...TILE_LAYER_OPTIONS };
        if (newTileUrl.includes('cartocdn.com')) {
            tileOptions.subdomains = 'abcd';
        } else if (newTileUrl.includes('tile.openstreetmap.org')) {
            tileOptions.subdomains = 'abc';
        } else {
            delete tileOptions.subdomains;
        }

        const newTileLayer = L.tileLayer(newTileUrl, tileOptions);

        newTileLayer.on('tileerror', function(error, tile) {
            console.error('Tile loading error:', error, tile);
        });

        if (currentTileLayer) {
            map.removeLayer(currentTileLayer);
        }

        newTileLayer.addTo(map);
        currentTileLayer = newTileLayer;

        if (!isInitialLoad) {
            updateAttribution();
        }
    };

    const updateAttribution = () => {
        if (!map || !map.attributionControl) return;
        const isDark = document.documentElement.classList.contains('dark');
        const attributionText = isDark ? DARK_TILE_ATTRIBUTION : LIGHT_TILE_ATTRIBUTION;

        map.attributionControl.setPrefix(false);
        map.attributionControl.addAttribution("temp-clear");
        map.attributionControl.removeAttribution("temp-clear");
        map.attributionControl.addAttribution(attributionText);
    };

    const toggleTheme = () => {
        const html = document.documentElement;
        html.classList.toggle('dark');
        localStorage.setItem('theme', html.classList.contains('dark') ? 'dark' : 'light');
        updateMapTheme();
    };

    themeToggleBtn.addEventListener('click', toggleTheme);

    // --- Sidebar Management ---
    const toggleSidebar = (forceOpen = null) => {
        const hamburgerWrapper = document.querySelector('.hamburger-wrapper');
        const isOpen = forceOpen !== null ? forceOpen : !sidebar.classList.contains('translate-x-0');

        sidebar.classList.toggle('translate-x-0', isOpen);
        sidebar.classList.toggle('-translate-x-full', !isOpen);
        sidebarOverlay.classList.toggle('opacity-100', isOpen);
        sidebarOverlay.classList.toggle('pointer-events-auto', isOpen);
        sidebarOverlay.classList.toggle('pointer-events-none', !isOpen);
        hamburgerWrapper.classList.toggle('active', isOpen);

        if (!isOpen) {
            searchResultsContainer.classList.add('hidden');
        }

        setTimeout(() => {
            if (map) map.invalidateSize();
        }, 350);
    };

    toggleSidebarBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSidebar();
    });
    sidebarOverlay.addEventListener('click', () => toggleSidebar(false));

    // --- Location Finding ---
    const getUserLocation = () => {
        showLoading("Discovering Location...");

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    userLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };
                    map.flyTo([userLocation.lat, userLocation.lng], GEOLOCATION_ZOOM);
                    updateUserLocationMarker();
                    hideLoading();
                },
                (error) => {
                    console.warn("Browser geolocation failed:", error.message);
                    getIpLocation();
                }, {
                    enableHighAccuracy: true,
                    timeout: 8000,
                    maximumAge: 0
                }
            );
        } else {
            console.warn("Browser geolocation not supported.");
            getIpLocation();
        }
    };

    const getIpLocation = () => {
        showLoading("Estimating Location via IP...");
        fetch('https://ipapi.co/json/')
            .then(response => response.ok ? response.json() : Promise.reject('IP API Error'))
            .then(data => {
                if (data && data.latitude && data.longitude) {
                    userLocation = { lat: parseFloat(data.latitude), lng: parseFloat(data.longitude) };
                    map.flyTo([userLocation.lat, userLocation.lng], 10);
                    updateUserLocationMarker();
                    hideLoading();
                } else {
                    handleLocationError("Could not determine location from IP.");
                }
            })
            .catch(error => {
                handleLocationError("IP Geolocation failed.", error);
            });
    };

    const handleLocationError = (message, error = null) => {
        console.error(message, error || '');
        if (!userLocation && map) {
            map.setView([DEFAULT_LAT, DEFAULT_LNG], DEFAULT_ZOOM);
        }
        hideLoading();
    };

    const updateUserLocationMarker = () => {
        if (!userLocation || !map) return;

        const userIcon = L.divIcon({
            className: 'user-location-marker',
            html: `<span class="relative flex h-3.5 w-3.5">
                       <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 dark:bg-primary-500 opacity-75"></span>
                       <span class="relative inline-flex rounded-full h-3.5 w-3.5 bg-primary-500 dark:bg-primary-600 border-2 border-white dark:border-gray-800"></span>
                   </span>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7],
            popupAnchor: [0, -10]
        });

        if (userLocationMarker) {
            userLocationMarker.setLatLng([userLocation.lat, userLocation.lng]);
        } else {
            userLocationMarker = L.marker([userLocation.lat, userLocation.lng], {
                icon: userIcon,
                zIndexOffset: 500
            }).addTo(map).bindPopup("Your approximate location");
        }
    };

    const centerOnUserLocation = () => {
        showLoading("Finding Your Location...");
        centerMapBtn.disabled = true;

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    userLocation = { lat: position.coords.latitude, lng: position.coords.longitude };
                    map.flyTo([userLocation.lat, userLocation.lng], GEOLOCATION_ZOOM);
                    updateUserLocationMarker();
                    hideLoading();
                    resetCenterButton();
                },
                (error) => {
                    console.error("Precise geolocation failed:", error.message);
                    handleLocationError("Could not get precise location.");
                    resetCenterButton();
                }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        } else {
            handleLocationError("Geolocation not supported.");
            resetCenterButton();
        }
    };

    const resetCenterButton = () => {
        setTimeout(() => {
            centerMapBtn.disabled = false;
        }, 500);
    };

    // --- Search Functionality ---
    const loadSearchHistory = () => {
        const storedHistory = localStorage.getItem('searchHistory');
        if (storedHistory) {
            try {
                searchHistory = JSON.parse(storedHistory);
                if (!Array.isArray(searchHistory)) searchHistory = [];
            } catch (e) {
                console.error("Failed to parse search history:", e);
                searchHistory = [];
            }
        }
        renderSearchHistory();
    };

    const saveSearchToHistory = (location) => {
        if (!location || !location.place_id || !location.lat || !location.lon || !location.display_name) {
            console.warn("Attempted to save invalid location to history:", location);
            return;
        }
        searchHistory = searchHistory.filter(item => item.place_id !== location.place_id);
        searchHistory.unshift(location);
        searchHistory = searchHistory.slice(0, 5);
        localStorage.setItem('searchHistory', JSON.stringify(searchHistory));
        renderSearchHistory();
    };

    const renderSearchHistory = () => {
        searchHistoryContainer.innerHTML = '';
        if (searchHistory.length === 0) {
            noHistoryMessage.classList.remove('hidden');
            clearSearchHistoryBtn.classList.add('hidden');
        } else {
            noHistoryMessage.classList.add('hidden');
            clearSearchHistoryBtn.classList.remove('hidden');
            searchHistory.forEach(item => {
                const historyItem = document.createElement('button');
                historyItem.type = 'button';
                historyItem.className = 'w-full p-2.5 rounded-md flex items-center space-x-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus-visible:ring-1 focus-visible:ring-primary-400 transition text-left';
                const iconClass = getLocationIcon(item.type, item.class);
                const displayName = item.display_name || 'Unknown Location';
                const mainName = displayName.split(',')[0];
                const details = displayName.split(',').slice(1).join(',').trim();

                historyItem.innerHTML = `
                    <div class="flex-shrink-0 w-5 text-center text-gray-400 dark:text-gray-500">
                       <i class="fas fa-history text-xs"></i>
                    </div>
                    <div class="flex-grow overflow-hidden">
                        <p class="text-sm font-medium text-gray-800 dark:text-gray-100 truncate" title="${mainName}">${mainName}</p>
                        ${details ? `<small class="text-xs text-gray-500 dark:text-gray-400 block truncate" title="${details}">${details}</small>` : ''}
                    </div>
                    <div class="flex-shrink-0 w-5 text-center text-gray-400 dark:text-gray-500">
                         <i class="${iconClass} text-xs"></i>
                    </div>
                `;
                historyItem.addEventListener('click', () => handleSearchResultSelection(item));
                searchHistoryContainer.appendChild(historyItem);
            });
        }
    };

    const clearSearchHistory = () => {
        searchHistory = [];
        localStorage.removeItem('searchHistory');
        renderSearchHistory();
    };

    clearSearchHistoryBtn.addEventListener('click', clearSearchHistory);

    const debouncedSearch = debounce(async () => {
        const query = searchBox.value.trim();
        searchResultsContainer.innerHTML = '';
        searchResultsContainer.classList.add('hidden');

        if (query.length < 2) {
            clearSearchBtn.classList.toggle('hidden', query.length === 0);
            if (nominatimXHR) nominatimXHR.abort();
            return;
        }

        clearSearchBtn.classList.remove('hidden');

        if (nominatimXHR) {
            nominatimXHR.abort();
            console.log('Previous Nominatim search aborted.');
        }

        searchResultsContainer.innerHTML = `<div class="p-3 text-center text-sm text-gray-500 dark:text-gray-400">Searching...</div>`;
        searchResultsContainer.classList.remove('hidden');

        try {
            const bounds = map ? map.getBounds() : null;
            const viewboxParam = bounds ? `&viewbox=${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}&bounded=1` : '';
            const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5${viewboxParam}&addressdetails=1`;

            const controller = new AbortController();
            nominatimXHR = controller;

            const response = await fetch(url, { signal: controller.signal });

            if (!response.ok) {
                throw new Error(`Nominatim API Error: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            nominatimXHR = null;

            renderSearchResults(data, query);

        } catch (error) {
            if (error.name === 'AbortError') {
                // Don't show error if aborted by new typing
            } else {
                console.error('Search error:', error);
                searchResultsContainer.innerHTML = `<div class="p-3 text-center text-sm text-red-600 dark:text-red-400">Search failed. Please try again.</div>`;
                searchResultsContainer.classList.remove('hidden');
            }
            nominatimXHR = null;
        }
    }, SEARCH_DEBOUNCE_MS);

    const renderSearchResults = (data, query) => {
        searchResultsContainer.innerHTML = '';
        if (data && data.length > 0) {
            data.forEach(item => {
                const resultItem = document.createElement('a');
                resultItem.href = '#';
                resultItem.tabIndex = 0;
                resultItem.className = 'flex items-center p-2.5 hover:bg-gray-100 dark:hover:bg-gray-600/70 cursor-pointer focus:outline-none focus-visible:bg-gray-100 dark:focus-visible:bg-gray-600/70 transition-colors duration-100';

                const iconClass = getLocationIcon(item.type, item.class);
                const displayName = item.display_name || 'Unknown Location';
                const mainName = displayName.split(',')[0];
                const details = displayName.split(',').slice(1).join(',').trim();

                resultItem.innerHTML = `
                    <div class="flex-shrink-0 w-6 text-center mr-2.5 text-primary-600 dark:text-primary-400">
                        <i class="${iconClass} text-sm"></i>
                    </div>
                    <div class="flex-grow overflow-hidden">
                        <strong class="block text-sm font-medium text-gray-800 dark:text-gray-100 truncate" title="${mainName}">${mainName}</strong>
                        ${details ? `<small class="block text-xs text-gray-500 dark:text-gray-400 truncate" title="${details}">${details}</small>` : ''}
                    </div>
                `;

                resultItem.addEventListener('click', (e) => {
                    e.preventDefault();
                    handleSearchResultSelection(item);
                });

                resultItem.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSearchResultSelection(item);
                    }
                });

                searchResultsContainer.appendChild(resultItem);
            });
            searchResultsContainer.classList.remove('hidden');
        } else {
            searchResultsContainer.innerHTML = `<div class="p-3 text-center text-sm text-gray-500 dark:text-gray-400">No results found for "${query}".</div>`;
            searchResultsContainer.classList.remove('hidden');
        }
    };

    const getLocationIcon = (type, osmClass) => {
        const classType = `${osmClass || 'unknown'}:${type || 'unknown'}`;

        switch (classType) {
            case 'place:city':
            case 'place:town': return 'fas fa-city';
            case 'place:village':
            case 'place:hamlet':
            case 'place:suburb':
            case 'place:neighbourhood': return 'fas fa-house-chimney-window';
            case 'boundary:administrative': return (type === 'country') ? 'fas fa-flag' : 'fas fa-landmark-flag';
            case 'amenity:restaurant': return 'fas fa-utensils';
            case 'amenity:cafe': return 'fas fa-mug-saucer';
            case 'amenity:bar':
            case 'amenity:pub': return 'fas fa-beer-mug-empty';
            case 'amenity:bank': return 'fas fa-landmark';
            case 'amenity:hospital': return 'fas fa-hospital';
            case 'amenity:clinic': return 'fas fa-clinic-medical';
            case 'amenity:pharmacy': return 'fas fa-pills';
            case 'amenity:school':
            case 'amenity:kindergarten':
            case 'amenity:college':
            case 'amenity:university': return 'fas fa-graduation-cap';
            case 'amenity:post_office': return 'fas fa-envelope';
            case 'amenity:police': return 'fas fa-shield-halved';
            case 'amenity:fire_station': return 'fas fa-fire-extinguisher';
            case 'amenity:parking': return 'fas fa-square-parking';
            case 'amenity:fuel': return 'fas fa-gas-pump';
            case 'amenity:atm': return 'fas fa-money-bill-wave';
            case 'shop:supermarket': return 'fas fa-cart-shopping';
            case 'shop:convenience': return 'fas fa-store';
            case 'shop:clothes': return 'fas fa-shirt';
            case 'shop:bakery': return 'fas fa-bread-slice';
            case 'tourism:hotel':
            case 'tourism:motel':
            case 'tourism:guest_house': return 'fas fa-hotel';
            case 'tourism:museum': return 'fas fa-landmark-dome';
            case 'tourism:attraction':
            case 'tourism:viewpoint': return 'fas fa-binoculars';
            case 'tourism:information': return 'fas fa-circle-info';
            case 'highway:bus_stop': return 'fas fa-bus-simple';
            case 'railway:station': return 'fas fa-train';
            case 'railway:subway_entrance': return 'fas fa-subway';
            case 'aeroway:aerodrome':
            case 'aeroway:airport': return 'fas fa-plane';
            case 'natural:peak': return 'fas fa-mountain-sun';
            case 'natural:tree': return 'fas fa-tree';
            case 'natural:water':
            case 'waterway:river':
            case 'natural:coastline': return 'fas fa-water';
            case 'natural:beach': return 'fas fa-umbrella-beach';
            case 'building:house':
            case 'building:residential': return 'fas fa-home';
            case 'building:apartments': return 'fas fa-building';
            case 'highway:motorway':
            case 'highway:trunk':
            case 'highway:primary':
            case 'highway:secondary':
            case 'highway:tertiary':
            case 'highway:residential':
            case 'highway:road':
            case 'highway:unclassified': return 'fas fa-road';
        }
        switch (type) {
            case 'administrative': return 'fas fa-landmark-flag';
            case 'residential': return 'fas fa-building';
            case 'road': case 'street': return 'fas fa-road';
            case 'building': return 'far fa-building';
            case 'motorway': case 'trunk': case 'primary': case 'secondary': case 'tertiary': return 'fas fa-road';
            default: return 'fas fa-map-marker-alt';
        }
    };

    const handleSearchResultSelection = (item) => {
        const lat = parseFloat(item.lat);
        const lng = parseFloat(item.lon);

        if (isNaN(lat) || isNaN(lng)) {
            console.error("Invalid coordinates for selected item:", item);
            showLoading("Error: Invalid location data.");
            setTimeout(hideLoading, 1500);
            return;
        }

        const displayName = item.display_name || 'Selected Location';
        searchBox.value = displayName;
        searchResultsContainer.classList.add('hidden');
        clearSearchBtn.classList.remove('hidden');

        map.flyTo([lat, lng], SEARCH_FLY_ZOOM, { duration: 1.0 });

        removeSearchMarker();

        const searchIcon = L.divIcon({
            className: 'search-marker-icon',
            html: `<i class="fas fa-map-pin text-3xl text-red-500 dark:text-red-400"></i>`,
            iconSize: [30, 36],
            iconAnchor: [15, 36],
            popupAnchor: [0, -38]
        });

        searchMarker = L.marker([lat, lng], {
            icon: searchIcon,
            zIndexOffset: 1000
        }).addTo(map);

        const mainName = displayName.split(',')[0];
        const details = displayName.split(',').slice(1).join(',').trim();
        const popupContent = `<div class="text-center">
                                <strong class="block text-base font-semibold mb-1">${mainName}</strong>
                                ${details ? `<span class="text-xs text-gray-600 dark:text-gray-400">${details}</span>` : ''}
                              </div>`;
        searchMarker.bindPopup(popupContent).openPopup();

        saveSearchToHistory(item);
        removeMarkerBtn.classList.remove('hidden');
    };

    const removeSearchMarker = () => {
        if (searchMarker) {
            map.removeLayer(searchMarker);
            searchMarker = null;
            removeMarkerBtn.classList.add('hidden');
        }
    };

    // --- Event Listeners Setup ---
    const setupEventListeners = () => {
        searchBox.addEventListener('input', debouncedSearch);

        searchBox.addEventListener('focus', () => {
            if (searchBox.value.trim().length >= 2 && searchResultsContainer.children.length > 0 && !searchResultsContainer.innerHTML.includes("No results")) {
                searchResultsContainer.classList.remove('hidden');
            } else if (searchBox.value.trim().length === 0 && searchHistory.length > 0) {
                renderSearchHistory();
            }
        });

        searchResultsContainer.addEventListener('mousedown', (e) => {
            if (e.target.closest('a')) {
                e.preventDefault();
            }
        });

        document.addEventListener('click', (e) => {
            const searchWrapper = searchBox.closest('.relative');
            if (searchWrapper && !searchWrapper.contains(e.target)) {
                searchResultsContainer.classList.add('hidden');
            }
        });

        clearSearchBtn.addEventListener('click', () => {
            searchBox.value = '';
            searchResultsContainer.innerHTML = '';
            searchResultsContainer.classList.add('hidden');
            clearSearchBtn.classList.add('hidden');
            if (nominatimXHR) nominatimXHR.abort();
            searchBox.focus();
        });

        searchBox.addEventListener('keydown', (e) => {
            const items = searchResultsContainer.querySelectorAll('a');
            if (items.length === 0 || searchResultsContainer.classList.contains('hidden')) return;

            const currentFocus = searchResultsContainer.querySelector(':focus');
            let currentIndex = -1;

            if (currentFocus && currentFocus.tagName === 'A') {
                currentIndex = Array.from(items).indexOf(currentFocus);
            }

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                const nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
                items[nextIndex]?.focus();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                const prevIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
                items[prevIndex]?.focus();
            } else if (e.key === 'Enter') {
                if(document.activeElement === searchBox && items.length > 0) {
                    e.preventDefault();
                    items[0].focus();
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                searchResultsContainer.classList.add('hidden');
                searchBox.focus();
            }
        });
    };

    applyInitialTheme();
    initializeMap();
    loadSearchHistory();
    setupEventListeners();
});