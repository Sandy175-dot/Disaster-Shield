import logging
import random
from datetime import datetime, timedelta
from flask import render_template, request, redirect, url_for, flash, jsonify, abort
from flask_login import login_user, logout_user, login_required, current_user
from werkzeug.security import check_password_hash
from sqlalchemy import func, desc

from app import app, db, socketio
from models import (User, Region, Alert, MonitoringStatus, SystemConfiguration,
                   UserRole, DisasterType, AlertSeverity, AlertStatus)
from satellite_processor import SatelliteDataProcessor
from ai_detector import DisasterDetectionAI
from monitoring_service import get_monitoring_service

# Initialize services
satellite_processor = SatelliteDataProcessor()
ai_detector = DisasterDetectionAI()

@app.route('/')
def index():
    if current_user.is_authenticated:
        return redirect(url_for('dashboard'))
    return redirect(url_for('login'))

@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('dashboard'))
    
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        
        user = User.query.filter_by(username=username).first()
        
        if user and password and user.password_hash and check_password_hash(user.password_hash, password):
            login_user(user)
            user.last_login = datetime.utcnow()
            db.session.commit()
            
            flash(f'Welcome back, {user.full_name}!', 'success')
            return redirect(url_for('dashboard'))
        else:
            flash('Invalid username or password', 'error')
    
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    flash('You have been logged out successfully', 'info')
    return redirect(url_for('login'))

@app.route('/dashboard')
@login_required
def dashboard():
    # Get all regions with their monitoring status
    regions = db.session.query(Region, MonitoringStatus)\
        .outerjoin(MonitoringStatus)\
        .all()
    
    # Get recent alerts
    recent_alerts = Alert.query\
        .filter(Alert.status.in_([AlertStatus.ACTIVE, AlertStatus.ACKNOWLEDGED]))\
        .order_by(desc(Alert.detected_at))\
        .limit(10)\
        .all()
    
    # Get alert statistics
    alert_stats = {
        'total_active': Alert.query.filter_by(status=AlertStatus.ACTIVE).count(),
        'total_acknowledged': Alert.query.filter_by(status=AlertStatus.ACKNOWLEDGED).count(),
        'total_resolved_today': Alert.query.filter(
            Alert.status == AlertStatus.RESOLVED,
            Alert.resolved_at >= datetime.utcnow().date()
        ).count(),
        'critical_alerts': Alert.query.filter(
            Alert.severity == AlertSeverity.CRITICAL,
            Alert.status.in_([AlertStatus.ACTIVE, AlertStatus.ACKNOWLEDGED])
        ).count()
    }
    
    # Get system health
    monitoring_service = get_monitoring_service()
    system_health = {
        'is_monitoring': monitoring_service.is_running if monitoring_service else False,
        'regions_monitored': len([r for r, ms in regions if ms and ms.is_monitoring]),
        'last_update': max([ms.updated_at for r, ms in regions if ms], default=None)
    }
    
    return render_template('dashboard.html',
                         regions=regions,
                         recent_alerts=recent_alerts,
                         alert_stats=alert_stats,
                         system_health=system_health,
                         datetime=datetime)

@app.route('/alerts')
@login_required
def alerts():
    # Get filter parameters
    severity_filter = request.args.get('severity')
    status_filter = request.args.get('status')
    disaster_type_filter = request.args.get('disaster_type')
    region_filter = request.args.get('region')
    
    # Build query
    query = Alert.query.join(Region)
    
    if severity_filter:
        query = query.filter(Alert.severity == AlertSeverity(severity_filter))
    if status_filter:
        query = query.filter(Alert.status == AlertStatus(status_filter))
    if disaster_type_filter:
        query = query.filter(Alert.disaster_type == DisasterType(disaster_type_filter))
    if region_filter:
        query = query.filter(Region.name == region_filter)
    
    alerts = query.order_by(desc(Alert.detected_at)).all()
    regions = Region.query.all()
    
    return render_template('alerts.html',
                         alerts=alerts,
                         regions=regions,
                         current_filters={
                             'severity': severity_filter,
                             'status': status_filter,
                             'disaster_type': disaster_type_filter,
                             'region': region_filter
                         },
                         severity_options=AlertSeverity,
                         status_options=AlertStatus,
                         disaster_type_options=DisasterType,
                         datetime=datetime)

@app.route('/alerts/<int:alert_id>/acknowledge', methods=['POST'])
@login_required
def acknowledge_alert(alert_id):
    alert = Alert.query.get_or_404(alert_id)
    
    if alert.status == AlertStatus.ACTIVE:
        alert.status = AlertStatus.ACKNOWLEDGED
        alert.acknowledged_at = datetime.utcnow()
        alert.acknowledged_by_id = current_user.id
        
        db.session.commit()
        
        # Emit socket event for real-time update
        socketio.emit('alert_updated', {
            'alert_id': alert.id,
            'status': alert.status.value,
            'acknowledged_by': current_user.full_name
        })
        
        flash(f'Alert "{alert.title}" has been acknowledged', 'success')
    else:
        flash('Alert cannot be acknowledged in its current state', 'error')
    
    return redirect(url_for('alerts'))

@app.route('/alerts/<int:alert_id>/resolve', methods=['POST'])
@login_required
def resolve_alert(alert_id):
    alert = Alert.query.get_or_404(alert_id)
    
    if alert.status in [AlertStatus.ACTIVE, AlertStatus.ACKNOWLEDGED]:
        alert.status = AlertStatus.RESOLVED
        alert.resolved_at = datetime.utcnow()
        alert.resolved_by_id = current_user.id
        
        db.session.commit()
        
        # Emit socket event for real-time update
        socketio.emit('alert_updated', {
            'alert_id': alert.id,
            'status': alert.status.value,
            'resolved_by': current_user.full_name
        })
        
        flash(f'Alert "{alert.title}" has been resolved', 'success')
    else:
        flash('Alert cannot be resolved in its current state', 'error')
    
    return redirect(url_for('alerts'))

@app.route('/regions')
@login_required
def regions():
    regions = db.session.query(Region, MonitoringStatus)\
        .outerjoin(MonitoringStatus)\
        .all()
    
    return render_template('regions.html', regions=regions, datetime=datetime)

@app.route('/regions/<int:region_id>/analyze', methods=['POST'])
@login_required
def analyze_region(region_id):
    region = Region.query.get_or_404(region_id)
    
    try:
        # Process satellite data for the region
        satellite_data = satellite_processor.get_region_data(
            region.min_latitude, region.max_latitude,
            region.min_longitude, region.max_longitude
        )
        
        # Run AI analysis
        analysis_result = ai_detector.analyze_region_data(satellite_data, region.name)
        
        # Update monitoring status
        monitoring_status = MonitoringStatus.query.filter_by(region_id=region.id).first()
        if not monitoring_status:
            monitoring_status = MonitoringStatus()
            monitoring_status.region_id = region.id
            db.session.add(monitoring_status)
        
        monitoring_status.last_analysis_at = datetime.utcnow()
        monitoring_status.threat_level = analysis_result.get('threat_level', 'normal')
        monitoring_status.anomalies_detected = analysis_result.get('anomalies_count', 0)
        monitoring_status.processing_time_seconds = analysis_result.get('processing_time', 0)
        
        # Generate alerts if threats detected
        if analysis_result.get('threats'):
            for threat in analysis_result['threats']:
                alert = Alert()
                alert.region_id = region.id
                alert.disaster_type = DisasterType(threat['type'])
                alert.severity = AlertSeverity(threat['severity'])
                alert.title = threat['title']
                alert.description = threat['description']
                alert.latitude = threat.get('latitude', region.center_latitude)
                alert.longitude = threat.get('longitude', region.center_longitude)
                alert.confidence_score = threat.get('confidence', 0.0)
                alert.prediction_model = threat.get('model', 'DisasterDetectionAI')
                alert.estimated_affected_population = threat.get('affected_population', 0)
                db.session.add(alert)
        
        db.session.commit()
        
        # Emit socket event for real-time update
        socketio.emit('region_analyzed', {
            'region_id': region.id,
            'region_name': region.name,
            'threat_level': analysis_result.get('threat_level', 'normal'),
            'anomalies': analysis_result.get('anomalies_count', 0),
            'threats_detected': len(analysis_result.get('threats', []))
        })
        
        flash(f'Region "{region.name}" analysis completed. '
              f'Threat level: {analysis_result.get("threat_level", "normal")}', 'info')
        
    except Exception as e:
        logging.error(f"Error analyzing region {region.name}: {str(e)}")
        flash(f'Error analyzing region "{region.name}": {str(e)}', 'error')
    
    return redirect(url_for('regions'))

@app.route('/monitoring/start', methods=['POST'])
@login_required
def start_monitoring():
    if current_user.role not in [UserRole.ADMINISTRATOR, UserRole.RESCUE_DEPARTMENT]:
        flash('You do not have permission to control monitoring', 'error')
        return redirect(url_for('dashboard'))
    
    monitoring_service = get_monitoring_service()
    if monitoring_service:
        monitoring_service.start_monitoring()
        flash('Real-time monitoring started', 'success')
    else:
        flash('Monitoring service is not available', 'error')
    
    return redirect(url_for('dashboard'))

@app.route('/monitoring/stop', methods=['POST'])
@login_required
def stop_monitoring():
    if current_user.role not in [UserRole.ADMINISTRATOR, UserRole.RESCUE_DEPARTMENT]:
        flash('You do not have permission to control monitoring', 'error')
        return redirect(url_for('dashboard'))
    
    monitoring_service = get_monitoring_service()
    if monitoring_service:
        monitoring_service.stop_monitoring()
        flash('Real-time monitoring stopped', 'warning')
    else:
        flash('Monitoring service is not available', 'error')
    
    return redirect(url_for('dashboard'))

@app.route('/statistics')
@login_required
def statistics():
    # Generate historic data if there are no alerts
    if Alert.query.count() == 0:
        generate_historic_alerts()
    
    # Alert statistics by type
    alert_by_type = db.session.query(
        Alert.disaster_type,
        func.count(Alert.id).label('count')
    ).group_by(Alert.disaster_type).all()
    
    # Alert statistics by severity
    alert_by_severity = db.session.query(
        Alert.severity,
        func.count(Alert.id).label('count')
    ).group_by(Alert.severity).all()
    
    # Regional statistics
    regional_stats = db.session.query(
        Region.name,
        func.count(Alert.id).label('alert_count'),
        func.avg(Alert.confidence_score).label('avg_confidence')
    ).outerjoin(Alert).group_by(Region.name).all()
    
    # Weekly alert trends
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    daily_alerts = db.session.query(
        func.date(Alert.detected_at).label('date'),
        func.count(Alert.id).label('count')
    ).filter(Alert.detected_at >= seven_days_ago)\
     .group_by(func.date(Alert.detected_at))\
     .order_by(func.date(Alert.detected_at)).all()
    
    return render_template('statistics.html',
                         alert_by_type=alert_by_type,
                         alert_by_severity=alert_by_severity,
                         regional_stats=regional_stats,
                         daily_alerts=daily_alerts,
                         datetime=datetime)

# API endpoints for AJAX requests
@app.route('/api/regions/<int:region_id>/status')
@login_required
def get_region_status(region_id):
    monitoring_status = MonitoringStatus.query.filter_by(region_id=region_id).first()
    if not monitoring_status:
        return jsonify({'error': 'Region not found'}), 404
    
    return jsonify({
        'is_monitoring': monitoring_status.is_monitoring,
        'last_analysis': monitoring_status.last_analysis_at.isoformat() if monitoring_status.last_analysis_at else None,
        'threat_level': monitoring_status.threat_level,
        'anomalies': monitoring_status.anomalies_detected
    })

@app.route('/api/alerts/recent')
@login_required
def get_recent_alerts():
    alerts = Alert.query.filter(
        Alert.status.in_([AlertStatus.ACTIVE, AlertStatus.ACKNOWLEDGED])
    ).order_by(desc(Alert.detected_at)).limit(5).all()
    
    return jsonify([{
        'id': alert.id,
        'title': alert.title,
        'severity': alert.severity.value,
        'region': alert.region.name,
        'detected_at': alert.detected_at.isoformat()
    } for alert in alerts])

# Socket events
@socketio.on('connect')
def handle_connect():
    if current_user.is_authenticated:
        logging.info(f'User {current_user.username} connected to WebSocket')
    else:
        logging.warning('Unauthenticated user attempted WebSocket connection')

@socketio.on('disconnect')
def handle_disconnect():
    if current_user.is_authenticated:
        logging.info(f'User {current_user.username} disconnected from WebSocket')

def generate_historic_alerts():
    """Generate historic alert data for demonstration purposes"""
    try:
        regions = Region.query.all()
        if not regions:
            return
        
        # Create historic alerts for the past 30 days
        disaster_types = list(DisasterType)
        severities = list(AlertSeverity)
        statuses = list(AlertStatus)
        
        historic_alerts = []
        
        for i in range(50):  # Generate 50 historic alerts
            days_back = random.randint(1, 30)
            alert_date = datetime.utcnow() - timedelta(days=days_back)
            
            region = random.choice(regions)
            disaster_type = random.choice(disaster_types)
            severity = random.choice(severities)
            status = random.choice(statuses)
            
            # Generate realistic titles and descriptions
            disaster_titles = {
                DisasterType.EARTHQUAKE: ["Seismic Activity Detected", "Earthquake Warning", "Ground Tremor Alert"],
                DisasterType.FLOOD: ["Flooding Risk High", "Water Level Rising", "Flood Alert Issued"],
                DisasterType.FIRE: ["Fire Outbreak Detected", "Wildfire Alert", "Fire Risk Critical"],
                DisasterType.CYCLONE: ["Cyclone Formation", "Storm System Approaching", "Cyclone Warning"],
                DisasterType.LANDSLIDE: ["Landslide Risk High", "Slope Instability", "Landslide Warning"],
                DisasterType.DROUGHT: ["Drought Conditions", "Water Scarcity Alert", "Drought Warning"],
                DisasterType.TSUNAMI: ["Tsunami Alert", "Sea Wave Warning", "Coastal Alert"]
            }
            
            title = random.choice(disaster_titles.get(disaster_type, ["Alert Detected"]))
            
            alert = Alert(
                region_id=region.id,
                disaster_type=disaster_type,
                severity=severity,
                status=status,
                title=title,
                description=f"Historic {disaster_type.value} alert for {region.name} area",
                latitude=region.center_latitude + random.uniform(-0.1, 0.1),
                longitude=region.center_longitude + random.uniform(-0.1, 0.1),
                confidence_score=random.uniform(0.7, 0.98),
                prediction_model="HistoricDataGenerator",
                estimated_affected_population=random.randint(1000, 50000),
                detected_at=alert_date
            )
            
            # Set acknowledgment and resolution times for non-active alerts
            if status != AlertStatus.ACTIVE:
                alert.acknowledged_at = alert_date + timedelta(minutes=random.randint(5, 30))
                if status == AlertStatus.RESOLVED:
                    alert.resolved_at = alert.acknowledged_at + timedelta(hours=random.randint(1, 12))
            
            historic_alerts.append(alert)
        
        # Bulk insert all alerts
        db.session.bulk_save_objects(historic_alerts)
        db.session.commit()
        
        logging.info(f"Generated {len(historic_alerts)} historic alerts")
        
    except Exception as e:
        logging.error(f"Error generating historic alerts: {str(e)}")
        db.session.rollback()

# Initialize default regions if they don't exist
def initialize_default_data():
    # Check if regions exist
    if Region.query.count() == 0:
        default_regions = [
            {
                'name': 'Bangalore',
                'description': 'Silicon Valley of India - Technology hub with high population density',
                'min_latitude': 12.7342, 'max_latitude': 13.1419,
                'min_longitude': 77.4601, 'max_longitude': 77.7864,
                'center_latitude': 12.9716, 'center_longitude': 77.5946,
                'population': 12500000
            },
            {
                'name': 'Delhi',
                'description': 'National Capital Territory - High population and infrastructure density',
                'min_latitude': 28.4041, 'max_latitude': 28.8833,
                'min_longitude': 76.8388, 'max_longitude': 77.3465,
                'center_latitude': 28.7041, 'center_longitude': 77.1025,
                'population': 30000000
            },
            {
                'name': 'Pune',
                'description': 'Cultural capital of Maharashtra - Educational and IT hub',
                'min_latitude': 18.4088, 'max_latitude': 18.6347,
                'min_longitude': 73.7306, 'max_longitude': 73.9787,
                'center_latitude': 18.5204, 'center_longitude': 73.8567,
                'population': 7500000
            },
            {
                'name': 'Mumbai',
                'description': 'Financial capital of India - Coastal megacity',
                'min_latitude': 18.8925, 'max_latitude': 19.2760,
                'min_longitude': 72.7758, 'max_longitude': 72.9969,
                'center_latitude': 19.0760, 'center_longitude': 72.8777,
                'population': 20000000
            },
            {
                'name': 'Jammu',
                'description': 'Winter capital of Jammu and Kashmir - Mountainous terrain',
                'min_latitude': 32.6181, 'max_latitude': 32.7913,
                'min_longitude': 74.7972, 'max_longitude': 75.0338,
                'center_latitude': 32.7266, 'center_longitude': 74.8570,
                'population': 1500000
            }
        ]
        
        # First, create and commit all regions
        regions = []
        for region_data in default_regions:
            region = Region(**region_data)
            db.session.add(region)
            regions.append(region)
        
        db.session.commit()  # Commit regions first to get their IDs
        
        # Then create monitoring status for each region
        for region in regions:
            monitoring_status = MonitoringStatus()
            monitoring_status.region_id = region.id
            monitoring_status.is_monitoring = False
            monitoring_status.threat_level = 'normal'
            db.session.add(monitoring_status)
        
        db.session.commit()
        logging.info("Default regions and monitoring status created")
