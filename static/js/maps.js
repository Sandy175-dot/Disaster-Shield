// Maps functionality for AI Disaster Management System

class MapManager {
    constructor() {
        this.maps = {};
        this.markers = {};
        this.init();
    }

    init() {
        // Set default map configuration
        this.defaultConfig = {
            center: [20.5937, 78.9629], // Center of India
            zoom: 5,
            minZoom: 3,
            maxZoom: 18
        };

        // Define threat level colors
        this.threatColors = {
            'critical': '#dc3545',
            'high': '#ffc107',
            'medium': '#17a2b8',
            'low': '#28a745',
            'normal': '#6c757d'
        };

        // Define disaster type icons
        this.disasterIcons = {
            'fire': '🔥',
            'flood': '🌊',
            'earthquake': '🌍',
            'landslide': '⛰️',
            'cyclone': '🌀',
            'drought': '🌵',
            'tsunami': '🌊'
        };
    }

    createMap(containerId, options = {}) {
        const config = { ...this.defaultConfig, ...options };
        
        const map = L.map(containerId, {
            center: config.center,
            zoom: config.zoom,
            minZoom: config.minZoom,
            maxZoom: config.maxZoom,
            zoomControl: true,
            attributionControl: true
        });

        // Add tile layer (OpenStreetMap)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(map);

        this.maps[containerId] = map;
        this.markers[containerId] = [];

        return map;
    }

    addRegionMarker(map, region, options = {}) {
        const { center, bounds, threatLevel, isMonitoring, name, population } = region;
        
        // Create custom marker icon based on threat level
        const markerColor = this.threatColors[threatLevel] || this.threatColors.normal;
        const markerIcon = L.divIcon({
            className: 'custom-region-marker',
            html: `
                <div style="
                    background-color: ${markerColor};
                    width: 20px;
                    height: 20px;
                    border-radius: 50%;
                    border: 3px solid white;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 10px;
                    color: white;
                    font-weight: bold;
                ">
                    ${isMonitoring ? '👁️' : '⏸️'}
                </div>
            `,
            iconSize: [26, 26],
            iconAnchor: [13, 13],
            popupAnchor: [0, -13]
        });

        // Create marker
        const marker = L.marker(center, { icon: markerIcon }).addTo(map);

        // Create popup content
        const popupContent = `
            <div class="region-popup">
                <h6 class="mb-2">${name}</h6>
                <div class="mb-2">
                    <span class="badge bg-${this.getThreatLevelBootstrapColor(threatLevel)}">${threatLevel.charAt(0).toUpperCase() + threatLevel.slice(1)}</span>
                    ${isMonitoring ? '<span class="badge bg-success ms-1">Monitoring</span>' : '<span class="badge bg-secondary ms-1">Inactive</span>'}
                </div>
                ${population ? `<small class="text-muted"><i class="fas fa-users"></i> Population: ${(population / 1000000).toFixed(1)}M</small><br>` : ''}
                <small class="text-muted"><i class="fas fa-map-marker-alt"></i> ${center[0].toFixed(3)}, ${center[1].toFixed(3)}</small>
            </div>
        `;

        marker.bindPopup(popupContent);

        // Add bounding box if provided
        if (bounds && bounds.length === 2) {
            const rectangle = L.rectangle(bounds, {
                color: markerColor,
                weight: 2,
                opacity: 0.8,
                fillOpacity: 0.1
            }).addTo(map);

            // Bind same popup to rectangle
            rectangle.bindPopup(popupContent);
        }

        return marker;
    }

    addAlertMarker(map, alert, options = {}) {
        const { latitude, longitude, severity, disaster_type, title, confidence_score } = alert;
        
        if (!latitude || !longitude) return null;

        // Create alert marker icon
        const alertColor = this.getSeverityColor(severity);
        const disasterEmoji = this.disasterIcons[disaster_type] || '⚠️';
        
        const alertIcon = L.divIcon({
            className: 'custom-alert-marker',
            html: `
                <div style="
                    background-color: ${alertColor};
                    width: 30px;
                    height: 30px;
                    border-radius: 50%;
                    border: 3px solid white;
                    box-shadow: 0 3px 6px rgba(0,0,0,0.4);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 14px;
                    animation: pulse 2s infinite;
                ">
                    ${disasterEmoji}
                </div>
            `,
            iconSize: [36, 36],
            iconAnchor: [18, 18],
            popupAnchor: [0, -18]
        });

        // Create marker
        const marker = L.marker([latitude, longitude], { icon: alertIcon }).addTo(map);

        // Create popup content
        const popupContent = `
            <div class="alert-popup">
                <h6 class="mb-2">${title}</h6>
                <div class="mb-2">
                    <span class="badge bg-${this.getThreatLevelBootstrapColor(severity)}">${severity.charAt(0).toUpperCase() + severity.slice(1)}</span>
                    <span class="badge bg-info ms-1">${disaster_type.charAt(0).toUpperCase() + disaster_type.slice(1)}</span>
                </div>
                <small class="text-muted">
                    <i class="fas fa-brain"></i> Confidence: ${Math.round(confidence_score * 100)}%<br>
                    <i class="fas fa-map-marker-alt"></i> ${latitude.toFixed(4)}, ${longitude.toFixed(4)}
                </small>
            </div>
        `;

        marker.bindPopup(popupContent);

        return marker;
    }

    getSeverityColor(severity) {
        const colors = {
            'critical': '#dc3545',
            'high': '#ffc107',
            'medium': '#17a2b8',
            'low': '#6c757d'
        };
        return colors[severity] || colors.low;
    }

    getThreatLevelBootstrapColor(level) {
        const colors = {
            'critical': 'danger',
            'high': 'warning',
            'medium': 'info',
            'low': 'success',
            'normal': 'secondary'
        };
        return colors[level] || 'secondary';
    }

    fitMapToRegions(map, regions) {
        if (!regions || regions.length === 0) return;

        const group = new L.featureGroup();
        
        regions.forEach(region => {
            if (region.bounds && region.bounds.length === 2) {
                const rectangle = L.rectangle(region.bounds);
                group.addLayer(rectangle);
            } else if (region.center) {
                const marker = L.marker(region.center);
                group.addLayer(marker);
            }
        });

        if (group.getLayers().length > 0) {
            map.fitBounds(group.getBounds(), { padding: [20, 20] });
        }
    }

    updateRegionMarker(mapId, regionId, updatedData) {
        const map = this.maps[mapId];
        if (!map) return;

        // Find and update the marker for this region
        // This would require keeping track of markers by region ID
        // Implementation depends on how markers are stored
    }

    clearMap(mapId) {
        const map = this.maps[mapId];
        if (!map) return;

        map.eachLayer(layer => {
            if (layer instanceof L.Marker || layer instanceof L.Rectangle) {
                map.removeLayer(layer);
            }
        });

        this.markers[mapId] = [];
    }

    destroyMap(mapId) {
        const map = this.maps[mapId];
        if (map) {
            map.remove();
            delete this.maps[mapId];
            delete this.markers[mapId];
        }
    }
}

// Initialize global map manager
window.mapManager = new MapManager();

// Dashboard map initialization function
function initializeDashboardMap(regionData) {
    const map = window.mapManager.createMap('regions-map', {
        zoom: 5
    });

    // Add markers for each region
    regionData.forEach(region => {
        window.mapManager.addRegionMarker(map, region);
    });

    // Fit map to show all regions
    window.mapManager.fitMapToRegions(map, regionData);
}

// Regions overview map initialization
function initializeRegionsOverviewMap(regionData) {
    const map = window.mapManager.createMap('regions-overview-map', {
        zoom: 5
    });

    // Add markers for each region
    regionData.forEach(region => {
        window.mapManager.addRegionMarker(map, region);
    });

    // Fit map to show all regions
    window.mapManager.fitMapToRegions(map, regionData);
}

// Region detail map initialization
function initializeRegionDetailMap(region) {
    // Clear existing map if it exists
    if (window.mapManager.maps['region-detail-map']) {
        window.mapManager.destroyMap('region-detail-map');
    }

    const map = window.mapManager.createMap('region-detail-map', {
        center: region.center,
        zoom: 10
    });

    // Add the region marker
    window.mapManager.addRegionMarker(map, region);

    // If bounds are available, fit to bounds
    if (region.bounds && region.bounds.length === 2) {
        const bounds = L.latLngBounds(region.bounds);
        map.fitBounds(bounds, { padding: [20, 20] });
    }
}

// Add CSS for marker animations
const style = document.createElement('style');
style.textContent = `
    @keyframes pulse {
        0% {
            transform: scale(1);
            opacity: 1;
        }
        50% {
            transform: scale(1.1);
            opacity: 0.7;
        }
        100% {
            transform: scale(1);
            opacity: 1;
        }
    }
    
    .custom-region-marker, .custom-alert-marker {
        border: none !important;
        background: transparent !important;
    }
    
    .region-popup, .alert-popup {
        min-width: 200px;
    }
    
    .region-popup h6, .alert-popup h6 {
        color: var(--bs-dark);
        margin-bottom: 0.5rem;
    }
    
    .leaflet-popup-content-wrapper {
        background: var(--bs-light);
        color: var(--bs-dark);
    }
    
    .leaflet-popup-tip {
        background: var(--bs-light);
    }
`;
document.head.appendChild(style);

// Export for global use
window.initializeDashboardMap = initializeDashboardMap;
window.initializeRegionsOverviewMap = initializeRegionsOverviewMap;
window.initializeRegionDetailMap = initializeRegionDetailMap;
