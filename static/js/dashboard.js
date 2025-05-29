// Dashboard JavaScript functionality for AI Disaster Management System

class DashboardManager {
    constructor() {
        this.updateInterval = 30000; // 30 seconds
        this.uptimeStartTime = new Date();
        this.init();
    }

    init() {
        this.updateSystemUptime();
        this.setupRealTimeUpdates();
        this.setupEventListeners();
        this.startPeriodicUpdates();
    }

    setupEventListeners() {
        // Handle monitoring control buttons
        const startBtn = document.querySelector('form[action*="start_monitoring"] button');
        const stopBtn = document.querySelector('form[action*="stop_monitoring"] button');

        if (startBtn) {
            startBtn.addEventListener('click', (e) => {
                this.showLoadingState(startBtn, 'Starting...');
            });
        }

        if (stopBtn) {
            stopBtn.addEventListener('click', (e) => {
                this.showLoadingState(stopBtn, 'Stopping...');
            });
        }

        // Handle analyze region buttons
        document.querySelectorAll('.analyze-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const regionName = btn.dataset.region;
                this.showLoadingState(btn, `<i class="fas fa-spinner fa-spin"></i> Analyzing ${regionName}...`);
            });
        });

        // Auto-refresh page data
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.refreshDashboardData();
            }
        });
    }

    showLoadingState(button, loadingText) {
        const originalText = button.innerHTML;
        const originalDisabled = button.disabled;

        button.disabled = true;
        button.innerHTML = loadingText;

        // Reset after 5 seconds (fallback)
        setTimeout(() => {
            button.disabled = originalDisabled;
            button.innerHTML = originalText;
        }, 5000);
    }

    updateSystemUptime() {
        const uptimeElement = document.getElementById('system-uptime');
        if (!uptimeElement) return;

        const updateUptime = () => {
            const now = new Date();
            const uptime = now - this.uptimeStartTime;
            
            const hours = Math.floor(uptime / (1000 * 60 * 60));
            const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((uptime % (1000 * 60)) / 1000);

            uptimeElement.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        };

        updateUptime();
        setInterval(updateUptime, 1000);
    }

    updateLastUpdateTime() {
        const lastUpdateElement = document.getElementById('last-update');
        if (lastUpdateElement) {
            const now = new Date();
            lastUpdateElement.textContent = now.toLocaleTimeString('en-GB', { 
                hour: '2-digit', 
                minute: '2-digit' 
            });
        }
    }

    setupRealTimeUpdates() {
        // Listen for real-time updates from socket
        if (window.socket) {
            window.socket.on('region_status_update', (data) => {
                this.updateRegionStatus(data);
            });

            window.socket.on('new_alert', (data) => {
                this.handleNewAlert(data);
            });

            window.socket.on('system_health_update', (data) => {
                this.updateSystemHealth(data);
            });

            window.socket.on('monitoring_status', (data) => {
                this.updateMonitoringStatus(data);
            });
        }
    }

    updateRegionStatus(data) {
        // Update region status in the table
        const regionRow = document.querySelector(`tr[data-region-id="${data.region_id}"]`);
        if (regionRow) {
            // Add flash animation
            regionRow.classList.add('update-flash');
            setTimeout(() => regionRow.classList.remove('update-flash'), 500);

            // Update threat level
            const threatCell = regionRow.querySelector('td:last-child span');
            if (threatCell) {
                threatCell.className = `badge bg-${this.getThreatLevelColor(data.threat_level)}`;
                threatCell.textContent = data.threat_level.charAt(0).toUpperCase() + data.threat_level.slice(1);
            }

            // Update last analysis time
            const lastAnalysisCell = regionRow.querySelector('small');
            if (lastAnalysisCell && data.last_analysis) {
                const date = new Date(data.last_analysis);
                lastAnalysisCell.textContent = `Last: ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
            }
        }

        this.updateLastUpdateTime();
    }

    handleNewAlert(data) {
        // Update alert counters
        this.updateAlertCounters();

        // Add new alert to recent alerts list
        this.addToRecentAlerts(data);

        // Show notification
        this.showNotification(`New ${data.severity} alert in ${data.region_name}`, 'warning');

        // Update navigation badge
        this.updateAlertBadge();
    }

    updateSystemHealth(data) {
        // Update system health indicators
        const healthIndicators = {
            'active_alerts': data.active_alerts,
            'monitoring_regions': data.monitoring_regions,
            'total_regions': data.total_regions
        };

        Object.keys(healthIndicators).forEach(key => {
            const element = document.querySelector(`[data-metric="${key}"]`);
            if (element) {
                element.textContent = healthIndicators[key];
            }
        });

        this.updateLastUpdateTime();
    }

    updateMonitoringStatus(data) {
        const statusBadge = document.querySelector('.card-header .badge');
        if (statusBadge) {
            if (data.status === 'started') {
                statusBadge.className = 'badge bg-success';
                statusBadge.innerHTML = '<i class="fas fa-eye"></i> Monitoring Active';
            } else {
                statusBadge.className = 'badge bg-secondary';
                statusBadge.innerHTML = '<i class="fas fa-eye-slash"></i> Monitoring Stopped';
            }
        }

        // Show notification
        this.showNotification(data.message, data.status === 'started' ? 'success' : 'warning');

        // Update button states
        this.updateMonitoringButtons(data.status === 'started');
    }

    updateMonitoringButtons(isMonitoring) {
        const startBtn = document.querySelector('form[action*="start_monitoring"] button');
        const stopBtn = document.querySelector('form[action*="stop_monitoring"] button');

        if (startBtn) startBtn.disabled = isMonitoring;
        if (stopBtn) stopBtn.disabled = !isMonitoring;
    }

    getThreatLevelColor(level) {
        const colors = {
            'critical': 'danger',
            'high': 'warning',
            'medium': 'info',
            'low': 'success',
            'normal': 'secondary'
        };
        return colors[level] || 'secondary';
    }

    updateAlertCounters() {
        // Fetch updated alert counts
        fetch('/api/alerts/recent')
            .then(response => response.json())
            .then(data => {
                // Update dashboard cards with new counts
                // This would need to be implemented based on your specific needs
            })
            .catch(error => console.error('Error updating alert counters:', error));
    }

    addToRecentAlerts(alertData) {
        const recentAlertsList = document.getElementById('recent-alerts-list');
        if (!recentAlertsList) return;

        // Create new alert item
        const alertItem = document.createElement('div');
        alertItem.className = 'list-group-item d-flex justify-content-between align-items-start';
        alertItem.innerHTML = `
            <div class="me-auto">
                <div class="fw-bold d-flex align-items-center">
                    <span class="badge bg-${this.getSeverityColor(alertData.severity)} me-2">${alertData.severity.charAt(0).toUpperCase() + alertData.severity.slice(1)}</span>
                    ${alertData.title}
                </div>
                <small class="text-muted">
                    <i class="fas fa-map-marker-alt"></i> ${alertData.region_name} • 
                    <i class="fas fa-clock"></i> Just now
                </small>
            </div>
            <span class="badge bg-secondary rounded-pill">
                ${Math.round(alertData.confidence * 100)}%
            </span>
        `;

        // Add to top of list
        recentAlertsList.insertBefore(alertItem, recentAlertsList.firstChild);

        // Remove oldest item if list is getting too long
        const items = recentAlertsList.querySelectorAll('.list-group-item');
        if (items.length > 10) {
            recentAlertsList.removeChild(items[items.length - 1]);
        }

        // Add flash animation
        alertItem.classList.add('update-flash');
        setTimeout(() => alertItem.classList.remove('update-flash'), 500);
    }

    getSeverityColor(severity) {
        const colors = {
            'critical': 'danger',
            'high': 'warning',
            'medium': 'info',
            'low': 'secondary'
        };
        return colors[severity] || 'secondary';
    }

    updateAlertBadge() {
        const alertBadge = document.getElementById('alert-badge');
        if (alertBadge) {
            // Fetch current active alert count
            fetch('/api/alerts/recent')
                .then(response => response.json())
                .then(data => {
                    const activeCount = data.length;
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

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
        notification.style.cssText = 'top: 20px; right: 20px; z-index: 1060; min-width: 300px;';
        notification.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;

        document.body.appendChild(notification);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
    }

    refreshDashboardData() {
        // Refresh key dashboard components
        this.updateAlertBadge();
        this.updateLastUpdateTime();
    }

    startPeriodicUpdates() {
        // Update various dashboard elements periodically
        setInterval(() => {
            this.refreshDashboardData();
        }, this.updateInterval);
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    window.dashboardManager = new DashboardManager();
});

// Export for use in other modules
window.DashboardManager = DashboardManager;
