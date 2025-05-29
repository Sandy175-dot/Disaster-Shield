from app import app, socketio

if __name__ == '__main__':
    # Start the monitoring service
    from monitoring_service import start_monitoring
    start_monitoring()
    
    # Run the app
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)
