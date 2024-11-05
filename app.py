# -*- coding: utf-8 -*-

import subprocess
import psutil
import string
import random
from flask import Flask, render_template, request
from cryptography.fernet import Fernet

app = Flask(__name__)
app.config['SECRET_KEY'] = 'multilinuxservice!flaskappservice'

"""
HOWTO - 'flasksudo' user to set up:
--------------------------------
> sudo adduser flasksudo
> sudo usermod -aG sudo flasksudo
> sudo visudo
> flasksudo ALL=(ALL:ALL) NOPASSWD:ALL
> use this user while executing the related service
"""

#************************************************************
# Configuration variables
#************************************************************

services = {
    "Palworld Server": "palworld.service",
    "Satisfactory Server": "satisfactory.service",
    "Valheim Server": "valheim.service",
    "Crafty Controller": "crafty.service",
}
systemctl_path = "/bin/systemctl"
sudo_path = "/bin/sudo"
monitoring_url = 'http://192.168.1.10:61208'
disable_system_info = True
sessions = []
key = b'7Gb0rGIhpif2u4aPgnqHvg631r7IpITnXj6MQE2yIFY='  # Fernet.generate_key()
token_app = b'gAAAAABnKo8R72Ym6AuuMhoCmotvBcPqDsFGZXfDhETJX12rOQyNLefGty2GAfxXhQiO_FEEQ5gNw2H4rZVwF-rucVd62JvLhA=='

#************************************************************
# Functions
#************************************************************

# Deprecated / not used anymore -> refer to monitoring tool
def get_system_info():
    gio = 1073741824
    return {
        'cpu_usage_percentage': psutil.cpu_percent(4),
        'virtual_memory_usage_percentage': psutil.virtual_memory()[2],
        'virtual_memory_usage_gb': round(psutil.virtual_memory()[3]/gio, 2),
        'total_virtual_memory_gb': round(psutil.virtual_memory()[0]/gio, 2),
        'swap_memory_usage_percentage': psutil.swap_memory()[3],
        'swap_memory_usage_gb': round(psutil.swap_memory()[1]/gio, 2),
    }

def get_service_status(service):
    status_command = [systemctl_path, "status", service]
    result = subprocess.run(status_command, capture_output=True, text=True)
    return result.stdout.strip()

def encrypt(password):
    return Fernet(key).encrypt(password)

def decrypt(token):
    return Fernet(key).decrypt(token)

def authentify(password):
    token_auth = encrypt(password.encode())
    result_auth = decrypt(token_auth).decode()
    result_app = decrypt(token_app).decode()
    is_success = result_auth == result_app
    session_id = None
    if is_success:
        session_id = session_generator()
        sessions.append(session_id)
    return {
        'status': 'success' if is_success else 'error',
        'session_id': session_id,
    }

def session_generator(size=36, chars=string.ascii_uppercase + string.digits):
    return ''.join(random.choice(chars) for _ in range(size))

def is_authenticated(session_id):
    return session_id in sessions

#************************************************************
# Controllers
#************************************************************

@app.route('/')
def index():
    return render_template(
        'index.html',
        system_info={},
        services=services,
        monitoring_url=monitoring_url,
        disable_system_info=disable_system_info,
    )

@app.route('/lws/auth', methods=['POST'])
def auth():
    data = request.get_json()
    password = data.get('password')
    auth = authentify(password)
    return auth

@app.route('/lws/check_auth', methods=['POST'])
def check_auth():
    data = request.get_json()
    session_id = data.get('session_id')
    return {
        'is_authenticated': is_authenticated(session_id),
    }

@app.route('/lws/action', methods=['POST'])
def perform_action():
    data = request.get_json()
    session_id = data.get('session_id')
    is_auth = is_authenticated(session_id)
    action = data.get('action')
    selected_service = data.get('service')
    message = None
    if is_auth and selected_service and action:
        service_name = services.get(selected_service)
        if action == "start":
            start_service_command = [sudo_path, "-n", systemctl_path, "start", service_name]
            subprocess.run(start_service_command)
            message = f'{selected_service} service has started successfully'
        elif action == "stop":
            # stop_service_command = [sudo_path, "-n", systemctl_path, "stop", service_name]
            stop_service_command = [sudo_path, "-n", systemctl_path, "stop", service_name]
            subprocess.run(stop_service_command)
            message = f'{selected_service} service has been stopped successfully'
        elif action == "status":
            message = get_service_status(service_name)
    return {
        'status': 'success' if is_auth else 'error',
        'message': message,
    }

if __name__ == '__main__':
    app.run(debug=True)
