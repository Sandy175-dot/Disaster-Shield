from datetime import datetime
from enum import Enum
from app import db
from flask_login import UserMixin
from sqlalchemy import func

class UserRole(Enum):
    ADMINISTRATOR = "administrator"
    RESCUE_DEPARTMENT = "rescue_department"
    HEALTH_SERVICES = "health_services"
    POLICE = "police"
    FIRE_DEPARTMENT = "fire_department"

class DisasterType(Enum):
    EARTHQUAKE = "earthquake"
    FLOOD = "flood"
    FIRE = "fire"
    CYCLONE = "cyclone"
    LANDSLIDE = "landslide"
    DROUGHT = "drought"
    TSUNAMI = "tsunami"

class AlertSeverity(Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

class AlertStatus(Enum):
    ACTIVE = "active"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"
    DISMISSED = "dismissed"

class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(64), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    role = db.Column(db.Enum(UserRole), nullable=False, default=UserRole.RESCUE_DEPARTMENT)
    full_name = db.Column(db.String(100), nullable=False)
    department = db.Column(db.String(100))
    phone = db.Column(db.String(20))
    active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_login = db.Column(db.DateTime)
    
    def __init__(self, **kwargs):
        super(User, self).__init__(**kwargs)

    def __repr__(self):
        return f'<User {self.username}>'

class Region(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), unique=True, nullable=False)
    description = db.Column(db.Text)
    
    # Bounding box coordinates
    min_latitude = db.Column(db.Float, nullable=False)
    max_latitude = db.Column(db.Float, nullable=False)
    min_longitude = db.Column(db.Float, nullable=False)
    max_longitude = db.Column(db.Float, nullable=False)
    
    # Center coordinates for map display
    center_latitude = db.Column(db.Float, nullable=False)
    center_longitude = db.Column(db.Float, nullable=False)
    
    is_monitored = db.Column(db.Boolean, default=True)
    risk_level = db.Column(db.String(20), default='medium')
    population = db.Column(db.Integer)
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationship with alerts
    alerts = db.relationship('Alert', backref='region', lazy=True)

    def __repr__(self):
        return f'<Region {self.name}>'

class Alert(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    region_id = db.Column(db.Integer, db.ForeignKey('region.id'), nullable=False)
    
    disaster_type = db.Column(db.Enum(DisasterType), nullable=False)
    severity = db.Column(db.Enum(AlertSeverity), nullable=False)
    status = db.Column(db.Enum(AlertStatus), default=AlertStatus.ACTIVE)
    
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    
    # Location details
    latitude = db.Column(db.Float)
    longitude = db.Column(db.Float)
    affected_radius_km = db.Column(db.Float)
    
    # AI confidence and prediction details
    confidence_score = db.Column(db.Float)  # 0.0 to 1.0
    prediction_model = db.Column(db.String(100))
    satellite_image_id = db.Column(db.String(100))
    
    # Impact assessment
    estimated_affected_population = db.Column(db.Integer)
    estimated_damage_level = db.Column(db.String(50))
    
    # Timestamps
    detected_at = db.Column(db.DateTime, default=datetime.utcnow)
    acknowledged_at = db.Column(db.DateTime)
    resolved_at = db.Column(db.DateTime)
    
    # User who handled the alert
    acknowledged_by_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    resolved_by_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    
    acknowledged_by = db.relationship('User', foreign_keys=[acknowledged_by_id])
    resolved_by = db.relationship('User', foreign_keys=[resolved_by_id])
    
    def __init__(self, **kwargs):
        super(Alert, self).__init__(**kwargs)

    def __repr__(self):
        return f'<Alert {self.title} - {self.severity.value}>'

class MonitoringStatus(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    region_id = db.Column(db.Integer, db.ForeignKey('region.id'), nullable=False)
    
    is_monitoring = db.Column(db.Boolean, default=False)
    last_analysis_at = db.Column(db.DateTime)
    last_satellite_data_at = db.Column(db.DateTime)
    
    # System health metrics
    cpu_usage = db.Column(db.Float)
    memory_usage = db.Column(db.Float)
    processing_time_seconds = db.Column(db.Float)
    
    # Analysis results
    threat_level = db.Column(db.String(20), default='normal')
    anomalies_detected = db.Column(db.Integer, default=0)
    
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    region = db.relationship('Region', backref='monitoring_status')
    
    def __init__(self, **kwargs):
        super(MonitoringStatus, self).__init__(**kwargs)

    def __repr__(self):
        return f'<MonitoringStatus {self.region.name if self.region else "Unknown"}>'

class SystemConfiguration(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(100), unique=True, nullable=False)
    value = db.Column(db.Text)
    description = db.Column(db.Text)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    updated_by_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    
    updated_by = db.relationship('User', backref='config_updates')

    def __repr__(self):
        return f'<SystemConfiguration {self.key}>'