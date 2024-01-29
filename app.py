# -*- coding: utf-8 -*-

import subprocess
import psutil
import string
import random
import json
from flask import Flask, render_template, request
from cryptography.fernet import Fernet

app = Flask(__name__)
app.config['SECRET_KEY'] = 'YOUR_SECRET_KEY'


# ************************************************************
# Functions
# ************************************************************


def load_services_config(config_file="config.json"):
    try:
        with open(config_file, 'r') as f:
            config = json.load(f)
            return config.get("services", {})
    except FileNotFoundError:
        print(f"Error: Configuration file '{config_file}' not found.")
        return {}
    except json.JSONDecodeError:
        print(f"Error: The file '{config_file}' is not a valid JSON.")
        return {}


# Deprecated / not used anymore -> refer to monitoring tool
def get_system_info():
    gio = 1073741824
    return {
        'cpu_usage_percentage': psutil.cpu_percent(4),
        'virtual_memory_usage_percentage': psutil.virtual_memory()[2],
        'virtual_memory_usage_gb': round(psutil.virtual_memory()[3] / gio, 2),
        'total_virtual_memory_gb': round(psutil.virtual_memory()[0] / gio, 2),
        'swap_memory_usage_percentage': psutil.swap_memory()[3],
        'swap_memory_usage_gb': round(psutil.swap_memory()[1] / gio, 2),
    }


def get_service_status(service):
    status_command = [SYSTEMCTL_PATH, "status", service]
    result = subprocess.run(status_command, capture_output=True, text=True)
    return result.stdout.strip()


def encrypt(password):
    return Fernet(KEY).encrypt(password)


def decrypt(token):
    return Fernet(KEY).decrypt(token)


def authentify(password):
    token_auth = encrypt(password.encode())
    result_auth = decrypt(token_auth).decode()
    result_app = decrypt(TOKEN_APP).decode()
    is_success = result_auth == result_app
    session_id = None
    if is_success:
        session_id = session_generator()
        SESSIONS.append(session_id)
    return {
        'status': 'success' if is_success else 'error',
        'session_id': session_id,
    }


def session_generator(size=36, chars=string.ascii_uppercase + string.digits):
    return ''.join(random.choice(chars) for _ in range(size))


def is_authenticated(session_id):
    return session_id in SESSIONS

# ************************************************************
# Controllers
# ************************************************************


@app.route('/')
def index():
    return render_template(
        'index.html',
        system_info={},
        services=SERVICES,
        monitoring_url=MONITORING_URL,
        disable_system_info=DISABLE_SYSTEM_INFO,
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
        service_name = SERVICES.get(selected_service)
        if action == "start":
            start_service_command = [SUDO_PATH, "-n", SYSTEMCTL_PATH, "start", service_name]
            subprocess.run(start_service_command)
            message = f'{selected_service} service has started successfully'
        elif action == "stop":
            # stop_service_command = [SUDO_PATH, "-n", SYSTEMCTL_PATH, "stop", service_name]
            stop_service_command = [SUDO_PATH, "-n", SYSTEMCTL_PATH, "stop", service_name]
            subprocess.run(stop_service_command)
            message = f'{selected_service} service has been stopped successfully'
        elif action == "status":
            message = get_service_status(service_name)
    return {
        'status': 'success' if is_auth else 'error',
        'message': message,
    }

# ************************************************************
# Configuration variables
# ************************************************************


# YOU SHOULD PROBABLY NOT EDIT THIS PART
SERVICES = load_services_config()
SESSIONS = []
SYSTEMCTL_PATH = "/bin/systemctl"
SUDO_PATH = "/bin/sudo"
DEBUG = False

# YOU SHOULD PROBABLY EDIT THIS PART
MONITORING_URL = ''
DISABLE_SYSTEM_INFO = True
# Generate your key with Fernet.generate_key() and copy/paste it.
KEY = b''
# Generate your token with Fernet(YOUR_KEY).encrypt('YOUR_PASSWORD'.encode()) and copy/paste it.
# This will be the application password.
TOKEN_APP = b''


if __name__ == '__main__':
    app.run(debug=DEBUG)
