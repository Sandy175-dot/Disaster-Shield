import os
import logging
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager
from flask_socketio import SocketIO
from sqlalchemy.orm import DeclarativeBase
from werkzeug.middleware.proxy_fix import ProxyFix

# Set up logging
logging.basicConfig(level=logging.DEBUG)

class Base(DeclarativeBase):
    pass

db = SQLAlchemy(model_class=Base)

# Create the app
app = Flask(__name__)
app.secret_key = os.environ.get("SESSION_SECRET", "disaster-mgmt-secret-key-2024")
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)

# Configure the database
app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get("DATABASE_URL", "sqlite:///disaster_management.db")
app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
    "pool_recycle": 300,
    "pool_pre_ping": True,
}

# Initialize extensions
db.init_app(app)
socketio = SocketIO(app, cors_allowed_origins="*")

# Initialize Flask-Login
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'
login_manager.login_message = 'Please log in to access the disaster management system.'

@login_manager.user_loader
def load_user(user_id):
    from models import User
    return User.query.get(int(user_id))

with app.app_context():
    # Import models to ensure tables are created
    import models
    
    # Create all tables
    db.create_all()
    
    # Create default admin user if it doesn't exist
    from models import User, UserRole
    from werkzeug.security import generate_password_hash
    
    if not User.query.filter_by(username='admin').first():
        admin_user = User(
            username='admin',
            email='admin@disaster-mgmt.com',
            password_hash=generate_password_hash('admin123'),
            role=UserRole.ADMINISTRATOR,
            full_name='System Administrator',
            department='Administration'
        )
        db.session.add(admin_user)
        db.session.commit()
        logging.info("Default admin user created: admin/admin123")

# Import routes after app initialization
import routes

if __name__ == '__main__':
    # Start the monitoring service
    from monitoring_service import start_monitoring
    start_monitoring()
    
    # Run the app
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)
