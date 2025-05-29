import logging
import threading
import time
from datetime import datetime
from typing import Optional

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app import app, db, socketio
from models import Region, MonitoringStatus, Alert, AlertStatus
from satellite_processor import SatelliteDataProcessor
from ai_detector import DisasterDetectionAI

class MonitoringService:
    """
    Background monitoring service that continuously monitors all regions
    for potential disasters using satellite data and AI analysis.
    """
    
    def __init__(self):
        self.scheduler = BackgroundScheduler()
        self.is_running = False
        self.satellite_processor = SatelliteDataProcessor()
        self.ai_detector = DisasterDetectionAI()
        self._lock = threading.Lock()
        
    def start_monitoring(self):
        """Start the background monitoring service"""
        with self._lock:
            if not self.is_running:
                try:
                    # Schedule monitoring jobs
                    self.scheduler.add_job(
                        func=self._monitor_all_regions,
                        trigger=IntervalTrigger(minutes=5),  # Monitor every 5 minutes
                        id='region_monitoring',
                        name='Region Monitoring Service',
                        replace_existing=True
                    )
                    
                    self.scheduler.add_job(
                        func=self._update_system_health,
                        trigger=IntervalTrigger(minutes=1),  # Update system health every minute
                        id='system_health',
                        name='System Health Monitor',
                        replace_existing=True
                    )
                    
                    self.scheduler.start()
                    self.is_running = True
                    
                    logging.info("Monitoring service started successfully")
                    
                    # Emit status update
                    with app.app_context():
                        socketio.emit('monitoring_status', {
                            'status': 'started',
                            'message': 'Real-time monitoring has been activated'
                        })
                        
                except Exception as e:
                    logging.error(f"Failed to start monitoring service: {str(e)}")
                    
    def stop_monitoring(self):
        """Stop the background monitoring service"""
        with self._lock:
            if self.is_running:
                try:
                    self.scheduler.shutdown()
                    self.is_running = False
                    
                    logging.info("Monitoring service stopped")
                    
                    # Emit status update
                    with app.app_context():
                        socketio.emit('monitoring_status', {
                            'status': 'stopped',
                            'message': 'Real-time monitoring has been deactivated'
                        })
                        
                except Exception as e:
                    logging.error(f"Failed to stop monitoring service: {str(e)}")
    
    def _monitor_all_regions(self):
        """Monitor all active regions for potential disasters"""
        with app.app_context():
            try:
                regions = Region.query.filter_by(is_monitored=True).all()
                
                for region in regions:
                    self._monitor_region(region)
                    
                logging.debug(f"Completed monitoring cycle for {len(regions)} regions")
                
            except Exception as e:
                logging.error(f"Error in monitoring cycle: {str(e)}")
    
    def _monitor_region(self, region: Region):
        """Monitor a specific region for disasters"""
        try:
            # Get or create monitoring status
            monitoring_status = MonitoringStatus.query.filter_by(region_id=region.id).first()
            if not monitoring_status:
                monitoring_status = MonitoringStatus(region_id=region.id)
                db.session.add(monitoring_status)
            
            monitoring_status.is_monitoring = True
            monitoring_status.last_analysis_at = datetime.utcnow()
            
            # Process satellite data
            satellite_data = self.satellite_processor.get_region_data(
                region.min_latitude, region.max_latitude,
                region.min_longitude, region.max_longitude
            )
            
            monitoring_status.last_satellite_data_at = datetime.utcnow()
            
            # Run AI analysis
            analysis_result = self.ai_detector.analyze_region_data(satellite_data, region.name)
            
            # Update monitoring status with results
            monitoring_status.threat_level = analysis_result.get('threat_level', 'normal')
            monitoring_status.anomalies_detected = analysis_result.get('anomalies_count', 0)
            monitoring_status.processing_time_seconds = analysis_result.get('processing_time', 0)
            monitoring_status.updated_at = datetime.utcnow()
            
            # Generate alerts for detected threats
            new_alerts = []
            threats = analysis_result.get('threats', [])
            
            for threat in threats:
                # Check if similar alert already exists
                existing_alert = Alert.query.filter_by(
                    region_id=region.id,
                    disaster_type=threat['type'],
                    status=AlertStatus.ACTIVE
                ).first()
                
                if not existing_alert:
                    alert = self._create_alert_from_threat(region, threat)
                    new_alerts.append(alert)
                    db.session.add(alert)
            
            db.session.commit()
            
            # Emit real-time updates if new alerts created
            if new_alerts:
                for alert in new_alerts:
                    socketio.emit('new_alert', {
                        'alert_id': alert.id,
                        'region_name': region.name,
                        'disaster_type': alert.disaster_type.value,
                        'severity': alert.severity.value,
                        'title': alert.title,
                        'confidence': alert.confidence_score,
                        'detected_at': alert.detected_at.isoformat()
                    })
                
                logging.info(f"Generated {len(new_alerts)} new alerts for {region.name}")
            
            # Emit region status update
            socketio.emit('region_status_update', {
                'region_id': region.id,
                'region_name': region.name,
                'threat_level': monitoring_status.threat_level,
                'anomalies': monitoring_status.anomalies_detected,
                'last_analysis': monitoring_status.last_analysis_at.isoformat(),
                'new_alerts': len(new_alerts)
            })
            
        except Exception as e:
            logging.error(f"Error monitoring region {region.name}: {str(e)}")
            
            # Update monitoring status with error
            if 'monitoring_status' in locals():
                monitoring_status.threat_level = 'error'
                monitoring_status.updated_at = datetime.utcnow()
                db.session.commit()
    
    def _create_alert_from_threat(self, region: Region, threat: dict) -> Alert:
        """Create an Alert object from a detected threat"""
        from models import DisasterType, AlertSeverity
        
        alert = Alert(
            region_id=region.id,
            disaster_type=DisasterType(threat['type']),
            severity=AlertSeverity(threat['severity']),
            title=threat['title'],
            description=threat['description'],
            latitude=threat.get('latitude', region.center_latitude),
            longitude=threat.get('longitude', region.center_longitude),
            confidence_score=threat.get('confidence', 0.0),
            prediction_model=threat.get('model', 'DisasterDetectionAI'),
            estimated_affected_population=threat.get('affected_population', 0),
            detected_at=datetime.utcnow()
        )
        
        return alert
    
    def _update_system_health(self):
        """Update system health metrics"""
        with app.app_context():
            try:
                # Calculate system metrics
                active_alerts = Alert.query.filter_by(status=AlertStatus.ACTIVE).count()
                total_regions = Region.query.filter_by(is_monitored=True).count()
                monitoring_regions = MonitoringStatus.query.filter_by(is_monitoring=True).count()
                
                # Update all monitoring statuses with system health
                monitoring_statuses = MonitoringStatus.query.all()
                
                for status in monitoring_statuses:
                    # Mock system metrics (in real implementation, get actual metrics)
                    status.cpu_usage = min(50 + (active_alerts * 2), 95)  # Mock CPU usage
                    status.memory_usage = min(40 + (monitoring_regions * 3), 90)  # Mock memory usage
                
                db.session.commit()
                
                # Emit system health update
                socketio.emit('system_health_update', {
                    'timestamp': datetime.utcnow().isoformat(),
                    'active_alerts': active_alerts,
                    'monitoring_regions': monitoring_regions,
                    'total_regions': total_regions,
                    'service_status': 'healthy' if self.is_running else 'stopped'
                })
                
            except Exception as e:
                logging.error(f"Error updating system health: {str(e)}")

# Global monitoring service instance
_monitoring_service: Optional[MonitoringService] = None

def get_monitoring_service() -> Optional[MonitoringService]:
    """Get the global monitoring service instance"""
    return _monitoring_service

def start_monitoring():
    """Initialize and start the monitoring service"""
    global _monitoring_service
    
    if _monitoring_service is None:
        _monitoring_service = MonitoringService()
    
    # Auto-start monitoring
    _monitoring_service.start_monitoring()
    
    logging.info("Monitoring service initialized and started")

def stop_monitoring():
    """Stop the monitoring service"""
    global _monitoring_service
    
    if _monitoring_service:
        _monitoring_service.stop_monitoring()
