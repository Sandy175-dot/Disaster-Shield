// Socket.IO client for real-time updates in the disaster management system

class SocketClient {
    constructor() {
        this.socket = null;
        this.connectionStatus = 'disconnected';
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        
        this.init();
    }

    init() {
        this.connect();
        this.setupEventListeners();
        this.updateConnectionStatus();
    }

    connect() {
        try {
            this.socket = io({
                transports: ['websocket', 'polling'],
                upgrade: true,
                rememberUpgrade: true,
                timeout: 20000,
                forceNew: false
            });

            this.setupSocketEventHandlers();
            
        } catch (error) {
            console.error('Failed to initialize socket connection:', error);
            this.handleConnectionError();
        }
    }

    setupSocketEventHandlers() {
        // Connection events
        this.socket.on('connect', () => {
            console.log('Socket connected successfully');
            this.connectionStatus = 'connected';
            this.reconnectAttempts = 0;
            this.updateConnectionStatus();
            this.showConnectionNotification('Connected to real-time updates', 'success');
        });

        this.socket.on('disconnect', (reason) => {
            console.log('Socket disconnected:', reason);
            this.connectionStatus = 'disconnected';
            this.updateConnectionStatus();
            
            if (reason === 'io server disconnect') {
                // Server initiated disconnect, try to reconnect
                this.attemptReconnect();
            }
        });

        this.socket.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
            this.handleConnectionError();
        });

        this.socket.on('reconnect', (attemptNumber) => {
            console.log('Socket reconnected after', attemptNumber, 'attempts');
            this.connectionStatus = 'connected';
            this.reconnectAttempts = 0;
            this.updateConnectionStatus();
            this.showConnectionNotification('Reconnected to real-time updates', 'success');
        });

        this.socket.on('reconnect_error', (error) => {
            console.error('Socket reconnection error:', error);
            this.handleConnectionError();
        });

        this.socket.on('reconnect_failed', () => {
            console.error('Socket reconnection failed after maximum attempts');
            this.connectionStatus = 'failed';
            this.updateConnectionStatus();
            this.showConnectionNotification('Failed to reconnect. Please refresh the page.', 'danger');
        });

        // Application-specific events
        this.setupApplicationEventHandlers();
    }

    setupApplicationEventHandlers() {
        // New alert received
        this.socket.on('new_alert', (data) => {
            console.log('New alert received:', data);
            this.handleNewAlert(data);
        });

        // Alert status updated
        this.socket.on('alert_updated', (data) => {
            console.log('Alert updated:', data);
            this.handleAlertUpdate(data);
        });

        // Region status updated
        this.socket.on('region_status_update', (data) => {
            console.log('Region status updated:', data);
            this.handleRegionStatusUpdate(data);
        });

        // Region analysis completed
        this.socket.on('region_analyzed', (data) => {
            console.log('Region analysis completed:', data);
            this.handleRegionAnalyzed(data);
        });

        // System health update
        this.socket.on('system_health_update', (data) => {
            console.log('System health updated:', data);
            this.handleSystemHealthUpdate(data);
        });

        // Monitoring status changed
        this.socket.on('monitoring_status', (data) => {
            console.log('Monitoring status changed:', data);
            this.handleMonitoringStatusChange(data);
        });
    }

    setupEventListeners() {
        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.connectionStatus === 'disconnected') {
                this.attemptReconnect();
            }
        });

        // Handle online/offline events
        window.addEventListener('online', () => {
            if (this.connectionStatus === 'disconnected') {
                this.attemptReconnect();
            }
        });

        window.addEventListener('offline', () => {
            this.connectionStatus = 'offline';
            this.updateConnectionStatus();
        });
    }

    handleNewAlert(data) {
        // Update navigation alert badge
        this.updateAlertBadge();

        // Notify dashboard manager if available
        if (window.dashboardManager) {
            window.dashboardManager.handleNewAlert(data);
        }

        // Notify alerts manager if available
        if (window.alertsManager) {
            window.alertsManager.handleNewAlert(data);
        }

        // Show browser notification if permission granted
        this.showBrowserNotification(
            `New ${data.severity} Alert`,
            `${data.title} in ${data.region_name}`,
            'alert'
        );

        // Play alert sound if enabled
        this.playAlertSound(data.severity);
    }

    handleAlertUpdate(data) {
        // Notify dashboard manager if available
        if (window.dashboardManager) {
            window.dashboardManager.handleAlertUpdate && window.dashboardManager.handleAlertUpdate(data);
        }

        // Notify alerts manager if available
        if (window.alertsManager) {
            window.alertsManager.handleAlertUpdate(data);
        }

        // Update alert badge
        this.updateAlertBadge();
    }

    handleRegionStatusUpdate(data) {
        // Notify dashboard manager if available
        if (window.dashboardManager) {
            window.dashboardManager.updateRegionStatus(data);
        }

        // Update maps if available
        if (window.mapManager) {
            window.mapManager.updateRegionMarker && window.mapManager.updateRegionMarker('regions-map', data.region_id, data);
        }
    }

    handleRegionAnalyzed(data) {
        const message = `Analysis completed for ${data.region_name}. Threat level: ${data.threat_level}`;
        
        if (data.threats_detected > 0) {
            this.showConnectionNotification(`⚠️ ${message} - ${data.threats_detected} threats detected!`, 'warning');
        } else {
            this.showConnectionNotification(`✅ ${message} - No threats detected.`, 'info');
        }
    }

    handleSystemHealthUpdate(data) {
        // Notify dashboard manager if available
        if (window.dashboardManager) {
            window.dashboardManager.updateSystemHealth(data);
        }
    }

    handleMonitoringStatusChange(data) {
        // Notify dashboard manager if available
        if (window.dashboardManager) {
            window.dashboardManager.updateMonitoringStatus(data);
        }

        const statusText = data.status === 'started' ? 'activated' : 'deactivated';
        this.showConnectionNotification(`Monitoring system ${statusText}`, data.status === 'started' ? 'success' : 'warning');
    }

    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('Maximum reconnection attempts reached');
            return;
        }

        this.reconnectAttempts++;
        this.connectionStatus = 'reconnecting';
        this.updateConnectionStatus();

        setTimeout(() => {
            console.log(`Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
            
            if (this.socket) {
                this.socket.connect();
            } else {
                this.connect();
            }
        }, this.reconnectDelay * this.reconnectAttempts);
    }

    handleConnectionError() {
        this.connectionStatus = 'error';
        this.updateConnectionStatus();
        
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.attemptReconnect();
        }
    }

    updateConnectionStatus() {
        const statusElement = document.getElementById('connection-status');
        if (!statusElement) return;

        const badge = statusElement.querySelector('.badge');
        if (!badge) return;

        const statusConfig = {
            'connected': {
                class: 'bg-success',
                icon: 'wifi',
                text: 'Connected'
            },
            'disconnected': {
                class: 'bg-danger',
                icon: 'wifi-slash',
                text: 'Disconnected'
            },
            'reconnecting': {
                class: 'bg-warning',
                icon: 'spinner fa-spin',
                text: 'Reconnecting...'
            },
            'error': {
                class: 'bg-danger',
                icon: 'exclamation-triangle',
                text: 'Connection Error'
            },
            'offline': {
                class: 'bg-secondary',
                icon: 'wifi-slash',
                text: 'Offline'
            },
            'failed': {
                class: 'bg-danger',
                icon: 'times',
                text: 'Connection Failed'
            }
        };

        const config = statusConfig[this.connectionStatus] || statusConfig.disconnected;
        badge.className = `badge ${config.class}`;
        badge.innerHTML = `<i class="fas fa-${config.icon}"></i> ${config.text}`;
    }

    updateAlertBadge() {
        const alertBadge = document.getElementById('alert-badge');
        if (alertBadge) {
            // Fetch updated alert count
            fetch('/api/alerts/recent')
                .then(response => response.json())
                .then(data => {
                    const activeCount = data.filter(alert => alert.status === 'active').length;
                    if (activeCount > 0) {
                        alertBadge.textContent = activeCount;
                        alertBadge.style.display = 'inline';
                    } else {
                        alertBadge.style.display = 'none';
                    }
                })
                .catch(error => console.error('Error updating alert badge:', error));
        }
    }

    showConnectionNotification(message, type = 'info') {
        // Don't show notifications for routine connection events
        if (type === 'success' && message.includes('Connected')) {
            return;
        }

        const notification = document.createElement('div');
        notification.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
        notification.style.cssText = 'bottom: 80px; right: 20px; z-index: 1060; min-width: 300px; max-width: 400px;';
        notification.innerHTML = `
            <div class="d-flex align-items-center">
                <i class="fas fa-wifi me-2"></i>
                <div>${message}</div>
            </div>
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;

        document.body.appendChild(notification);

        // Auto-remove after 4 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 4000);
    }

    showBrowserNotification(title, body, tag) {
        if ('Notification' in window && Notification.permission === 'granted') {
            const notification = new Notification(title, {
                body: body,
                tag: tag,
                icon: '/static/img/alert-icon.png', // Add if you have an icon
                requireInteraction: false
            });

            // Auto-close after 5 seconds
            setTimeout(() => notification.close(), 5000);
        }
    }

    playAlertSound(severity) {
        // Only play sound for high severity alerts
        if (severity === 'critical' || severity === 'high') {
            // You can add audio file URLs here
            // const audio = new Audio('/static/audio/alert.mp3');
            // audio.play().catch(error => console.log('Could not play alert sound:', error));
        }
    }

    requestNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission().then(permission => {
                console.log('Notification permission:', permission);
            });
        }
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
        }
    }

    emit(event, data) {
        if (this.socket && this.connectionStatus === 'connected') {
            this.socket.emit(event, data);
        } else {
            console.warn('Cannot emit event: socket not connected');
        }
    }
}

// Initialize socket client when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    window.socketClient = new SocketClient();
    window.socket = window.socketClient.socket;

    // Request notification permission
    window.socketClient.requestNotificationPermission();
});

// Export for global use
window.SocketClient = SocketClient;

// Handle page unload
window.addEventListener('beforeunload', function() {
    if (window.socketClient) {
        window.socketClient.disconnect();
    }
});
