// Alerts page JavaScript functionality

class AlertsManager {
    constructor() {
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupRealTimeUpdates();
        this.initializeAlertActions();
    }

    setupEventListeners() {
        // Handle alert action buttons
        document.querySelectorAll('form[action*="acknowledge_alert"]').forEach(form => {
            form.addEventListener('submit', (e) => {
                this.handleAlertAction(e, 'acknowledge');
            });
        });

        document.querySelectorAll('form[action*="resolve_alert"]').forEach(form => {
            form.addEventListener('submit', (e) => {
                this.handleAlertAction(e, 'resolve');
            });
        });

        // Handle filter form
        const filterForm = document.querySelector('form[action*="alerts"]');
        if (filterForm) {
            filterForm.addEventListener('submit', (e) => {
                this.showLoadingState();
            });
        }

        // Handle clear filters
        const clearFiltersBtn = document.querySelector('a[href*="alerts"]:not([href*="?"])');
        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener('click', (e) => {
                this.showLoadingState();
            });
        }
    }

    setupRealTimeUpdates() {
        if (window.socket) {
            window.socket.on('new_alert', (data) => {
                this.handleNewAlert(data);
            });

            window.socket.on('alert_updated', (data) => {
                this.handleAlertUpdate(data);
            });
        }
    }

    handleAlertAction(event, action) {
        const form = event.target;
        const button = form.querySelector('button');
        const alertCard = form.closest('.alert-card');
        
        if (button) {
            const originalText = button.innerHTML;
            const loadingText = action === 'acknowledge' ? 
                '<i class="fas fa-spinner fa-spin"></i> Acknowledging...' : 
                '<i class="fas fa-spinner fa-spin"></i> Resolving...';
            
            button.disabled = true;
            button.innerHTML = loadingText;

            // Add loading state to card
            if (alertCard) {
                alertCard.classList.add('loading');
            }

            // Reset after form submission
            setTimeout(() => {
                button.disabled = false;
                button.innerHTML = originalText;
                if (alertCard) {
                    alertCard.classList.remove('loading');
                }
            }, 3000);
        }
    }

    handleNewAlert(data) {
        // Check if we need to add this alert to the current view
        const currentFilters = this.getCurrentFilters();
        
        if (this.alertMatchesFilters(data, currentFilters)) {
            this.addNewAlertCard(data);
            this.showNotification(`New ${data.severity} alert: ${data.title}`, 'warning');
        }

        // Update alert count
        this.updateAlertCount();
    }

    handleAlertUpdate(data) {
        const alertCard = document.querySelector(`[data-alert-id="${data.alert_id}"]`);
        
        if (alertCard) {
            this.updateAlertCard(alertCard, data);
            this.showFlashAnimation(alertCard);
            
            const actionText = data.status === 'acknowledged' ? 'acknowledged' : 'resolved';
            const actionBy = data.acknowledged_by || data.resolved_by;
            
            this.showNotification(`Alert ${actionText} by ${actionBy}`, 'success');
        }
    }

    updateAlertCard(alertCard, data) {
        // Update status badge
        const statusBadge = alertCard.querySelector('.card-footer .badge');
        if (statusBadge) {
            statusBadge.className = `badge bg-${this.getStatusColor(data.status)}`;
            statusBadge.innerHTML = `<i class="fas fa-${this.getStatusIcon(data.status)}"></i> ${data.status.charAt(0).toUpperCase() + data.status.slice(1)}`;
        }

        // Update footer with acknowledgment/resolution info
        const cardFooter = alertCard.querySelector('.card-footer');
        if (cardFooter && (data.acknowledged_by || data.resolved_by)) {
            const userInfo = document.createElement('div');
            userInfo.className = 'mt-1';
            
            if (data.status === 'acknowledged' && data.acknowledged_by) {
                userInfo.innerHTML = `<small class="text-muted"><i class="fas fa-user"></i> Acknowledged by ${data.acknowledged_by}</small>`;
            } else if (data.status === 'resolved' && data.resolved_by) {
                userInfo.innerHTML = `<small class="text-muted"><i class="fas fa-user-check"></i> Resolved by ${data.resolved_by}</small>`;
            }
            
            // Remove existing user info
            const existingUserInfo = cardFooter.querySelector('.mt-1');
            if (existingUserInfo) {
                existingUserInfo.remove();
            }
            
            cardFooter.appendChild(userInfo);
        }

        // Hide action buttons for resolved/dismissed alerts
        if (data.status === 'resolved' || data.status === 'dismissed') {
            const actionDropdown = alertCard.querySelector('.dropdown');
            if (actionDropdown) {
                actionDropdown.style.display = 'none';
            }
        }
    }

    getStatusColor(status) {
        const colors = {
            'active': 'danger',
            'acknowledged': 'warning',
            'resolved': 'success',
            'dismissed': 'secondary'
        };
        return colors[status] || 'secondary';
    }

    getStatusIcon(status) {
        const icons = {
            'active': 'circle',
            'acknowledged': 'eye',
            'resolved': 'check',
            'dismissed': 'times'
        };
        return icons[status] || 'circle';
    }

    getCurrentFilters() {
        const urlParams = new URLSearchParams(window.location.search);
        return {
            severity: urlParams.get('severity'),
            status: urlParams.get('status'),
            disaster_type: urlParams.get('disaster_type'),
            region: urlParams.get('region')
        };
    }

    alertMatchesFilters(alert, filters) {
        // Check if the new alert matches current filter criteria
        if (filters.severity && alert.severity !== filters.severity) return false;
        if (filters.disaster_type && alert.disaster_type !== filters.disaster_type) return false;
        if (filters.region && alert.region_name !== filters.region) return false;
        // Note: New alerts are always 'active', so status filter is handled differently
        if (filters.status && filters.status !== 'active') return false;
        
        return true;
    }

    addNewAlertCard(alertData) {
        const alertsContainer = document.getElementById('alerts-container');
        if (!alertsContainer) return;

        // Create new alert card element
        const alertCard = this.createAlertCardElement(alertData);
        
        // Add to beginning of container
        const firstCard = alertsContainer.querySelector('.col-md-6');
        if (firstCard) {
            alertsContainer.insertBefore(alertCard, firstCard);
        } else {
            alertsContainer.appendChild(alertCard);
        }

        // Add flash animation
        setTimeout(() => {
            alertCard.classList.add('update-flash');
            setTimeout(() => alertCard.classList.remove('update-flash'), 500);
        }, 100);
    }

    createAlertCardElement(alertData) {
        const col = document.createElement('div');
        col.className = 'col-md-6 col-lg-4 mb-4';
        
        col.innerHTML = `
            <div class="card h-100 alert-card" data-alert-id="${alertData.alert_id}">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <div class="d-flex align-items-center">
                        <span class="badge bg-${this.getSeverityColor(alertData.severity)} me-2">
                            <i class="fas fa-exclamation-circle"></i> ${alertData.severity.charAt(0).toUpperCase() + alertData.severity.slice(1)}
                        </span>
                        <i class="fas fa-${this.getDisasterIcon(alertData.disaster_type)}"></i>
                    </div>
                    <div class="dropdown">
                        <button class="btn btn-sm btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown">
                            Actions
                        </button>
                        <ul class="dropdown-menu">
                            <li>
                                <form method="POST" action="/alerts/${alertData.alert_id}/acknowledge" class="m-0">
                                    <button type="submit" class="dropdown-item">
                                        <i class="fas fa-check text-success"></i> Acknowledge
                                    </button>
                                </form>
                            </li>
                            <li>
                                <form method="POST" action="/alerts/${alertData.alert_id}/resolve" class="m-0">
                                    <button type="submit" class="dropdown-item">
                                        <i class="fas fa-check-double text-primary"></i> Resolve
                                    </button>
                                </form>
                            </li>
                        </ul>
                    </div>
                </div>
                <div class="card-body">
                    <h6 class="card-title">${alertData.title}</h6>
                    <div class="row g-2 mb-3">
                        <div class="col-6">
                            <div class="border rounded p-2 text-center">
                                <div class="fw-bold">${alertData.region_name}</div>
                                <small class="text-muted">Region</small>
                            </div>
                        </div>
                        <div class="col-6">
                            <div class="border rounded p-2 text-center">
                                <div class="fw-bold">${Math.round(alertData.confidence * 100)}%</div>
                                <small class="text-muted">Confidence</small>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="card-footer">
                    <div class="d-flex justify-content-between align-items-center">
                        <span class="badge bg-danger">
                            <i class="fas fa-circle"></i> Active
                        </span>
                        <small class="text-muted">Just now</small>
                    </div>
                </div>
            </div>
        `;

        return col;
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

    getDisasterIcon(disasterType) {
        const icons = {
            'fire': 'fire',
            'flood': 'water',
            'earthquake': 'house-crack',
            'landslide': 'mountain',
            'cyclone': 'wind',
            'drought': 'sun',
            'tsunami': 'water'
        };
        return icons[disasterType] || 'exclamation-triangle';
    }

    showFlashAnimation(element) {
        element.classList.add('update-flash');
        setTimeout(() => element.classList.remove('update-flash'), 500);
    }

    showLoadingState() {
        const container = document.getElementById('alerts-container');
        if (container) {
            container.classList.add('loading');
        }
    }

    updateAlertCount() {
        // Update the badge in the page header
        const countBadge = document.querySelector('.badge.fs-6');
        if (countBadge) {
            const currentCount = parseInt(countBadge.textContent.split(' ')[0]);
            countBadge.textContent = `${currentCount + 1} alerts found`;
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

    initializeAlertActions() {
        // Re-setup event listeners for dynamically added content
        this.setupEventListeners();
    }
}

// Initialize alerts manager when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    window.alertsManager = new AlertsManager();
});

// Export for global use
window.AlertsManager = AlertsManager;
