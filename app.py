# -*- coding: utf-8 -*-

import subprocess
import psutil
import string
import random
import json
import os
import ollama
import threading
import time

from flask import Flask, render_template, request
from cryptography.fernet import Fernet
from datetime import datetime
from flask_socketio import SocketIO, emit
from database import init_db, get_service_schedules, save_service_schedule, delete_service_schedule, get_db_connection


def load_full_config(config_file="config.json"):
    try:
        with open(config_file, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"Error: Configuration file '{config_file}' not found.")
        return {}
    except json.JSONDecodeError:
        print(f"Error: The file '{config_file}' is not a valid JSON.")
        return {}


CONFIG = load_full_config()
init_db()
app = Flask(__name__)
app.config['SECRET_KEY'] = CONFIG.get("secret_key", "")
socketio = SocketIO(app, cors_allowed_origins="*")

SERVICES = CONFIG.get("services", {})
SERVICE_FILES = CONFIG.get("service_files", {})
SESSIONS = []
SYSTEMCTL_PATH = "/bin/systemctl"
SUDO_PATH = "/bin/sudo"
DEBUG = CONFIG.get("debug", False)
MONITORING_URL = CONFIG.get("monitoring_url", "")
DISABLE_SYSTEM_INFO = CONFIG.get("disable_system_info", True)
PORT = CONFIG.get("port", 5000)

KEY = CONFIG.get("fernet_key", "").encode()
TOKEN_APP = CONFIG.get("token_app", "").encode()

# **********************************************************
# Functions
# **********************************************************


def _get_system_info():
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


def get_file_path(service):
    """Get the configuration file path for a service."""
    return SERVICE_FILES.get(service)


def read_file(file_path):
    """Read the content of a file."""
    try:
        if not os.path.exists(file_path):
            return None, f"File not found: {file_path}"
        with open(file_path, 'r') as file:
            content = file.read()
        return content, None
    except Exception as e:
        return None, str(e)


def write_file(file_path, content):
    """Write content to a file."""
    try:
        # Create directory if it doesn't exist
        directory = os.path.dirname(file_path)
        if directory and not os.path.exists(directory):
            os.makedirs(directory)
        # Check if we need to use sudo to write the file
        if os.access(file_path, os.W_OK) or not os.path.exists(file_path):
            # We have write access or the file doesn't exist yet
            with open(file_path, 'w') as file:
                file.write(content)
        else:
            # We need sudo to write to this file
            try:
                # Create a temporary file
                temp_file = f"/tmp/lws_temp_{random.randint(1000, 9999)}"
                with open(temp_file, 'w') as file:
                    file.write(content)
                # Use sudo to copy the file to the destination
                copy_command = [SUDO_PATH, "-n", "cp", temp_file, file_path]
                subprocess.run(copy_command, check=True)
                # Remove the temporary file
                os.remove(temp_file)
            except subprocess.CalledProcessError as e:
                return False, f"Failed to write file with sudo: {str(e)}"
            except Exception as e:
                return False, f"Error using sudo to write file: {str(e)}"
        return True, None
    except Exception as e:
        return False, str(e)


def get_formatted_datetime():
    now = datetime.now()
    day = now.day
    month = now.strftime("%B")
    year = now.year
    hours_24 = now.hour
    hours_12 = now.strftime("%I")
    minutes = now.strftime("%M")
    return f"{day} {month} {year} {hours_24}:{minutes} ({hours_12}:{minutes})"


def ask_phi3(prompt):
    response = ollama.generate(
        model='phi3',
        prompt=prompt,
        options={
            'temperature': 0.3,
            'num_ctx': 1024,
            'num_threads': 2,
            'num_predict': 10,
        }
    )
    return response['response']


def schedule_checker_loop():
    while True:
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT service_name, schedule_text, operation FROM service_schedules")
                services = cursor.fetchall()
                formatted_datetime = get_formatted_datetime()

                for service_name, schedule_text, operation in services:
                    response = ask_phi3(f"""
                        Respond STRICTLY with a single character:
                        - "1" if the current time ({formatted_datetime}) matches "{schedule_text}".
                        - "0" otherwise.
                        DO NOT write ANYTHING else—no symbols, no punctuation, no disclaimers.
                    """)

                    if int(response.strip()[:1]):
                        if not DEBUG:
                            service_command = [SUDO_PATH, "-n", SYSTEMCTL_PATH, operation, SERVICES.get(service_name)]
                            subprocess.run(service_command)
                        print(f"Executed {operation} on {service_name} as scheduled")
                        if DEBUG:
                            print(f"DEBUG: {service_name} -> {operation} -> {schedule_text} | {formatted_datetime}")

        except Exception as e:
            print(f"Error in schedule checker: {str(e)}")

        time.sleep(60)

# **********************************************************
# Controllers
# **********************************************************


@app.route('/')
def index():
    return render_template(
        'index.html',
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


@app.route('/lws/get_system_info', methods=['POST'])
def get_system_info():
    return {
        'system_info': _get_system_info()
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
            stop_service_command = [SUDO_PATH, "-n", SYSTEMCTL_PATH, "stop", service_name]
            subprocess.run(stop_service_command)
            message = f'{selected_service} service has been stopped successfully'
        elif action == "restart":
            restart_service_command = [SUDO_PATH, "-n", SYSTEMCTL_PATH, "restart", service_name]
            subprocess.run(restart_service_command)
            message = f'{selected_service} service has been restarted successfully'
        elif action == "status":
            message = get_service_status(service_name)
    return {
        'status': 'success' if is_auth else 'error',
        'message': message,
    }


@app.route('/lws/get_file_content', methods=['POST'])
def get_file_content():
    """Get the content of a service configuration file."""
    data = request.get_json()
    session_id = data.get('session_id')
    service = data.get('service')
    if not is_authenticated(session_id):
        return {
            'status': 'error',
            'error': 'Authentication required'
        }
    if not service or service not in SERVICE_FILES:
        return {
            'status': 'error',
            'error': f'No configuration file defined for service: {service}'
        }
    file_path = SERVICE_FILES.get(service)
    content, error = read_file(file_path)
    if error:
        return {
            'status': 'error',
            'error': error
        }
    return {
        'status': 'success',
        'content': content,
        'file_path': os.path.join("..", os.path.basename(file_path))
    }


@app.route('/lws/save_file_content', methods=['POST'])
def save_file_content():
    """Save the content of a service configuration file."""
    data = request.get_json()
    session_id = data.get('session_id')
    service = data.get('service')
    content = data.get('content')
    if not is_authenticated(session_id):
        return {
            'status': 'error',
            'error': 'Authentication required'
        }
    if not service or service not in SERVICE_FILES:
        return {
            'status': 'error',
            'error': f'No configuration file defined for service: {service}'
        }
    if content is None:
        return {
            'status': 'error',
            'error': 'No content provided'
        }
    file_path = SERVICE_FILES.get(service)
    success, error = write_file(file_path, content)
    if not success:
        return {
            'status': 'error',
            'error': error
        }
    return {
        'status': 'success',
        'message': f'File saved successfully: {file_path}'
    }


# **********************************************************
# SocketIO
# **********************************************************

@socketio.on('connect')
def handle_connect():
    print('Client connected')


@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected')


@socketio.on('get_schedules')
def handle_get_schedules(data):
    service_name = data.get('service')
    if not service_name:
        emit('error', {'message': 'Service name required'})
        return

    schedules = get_service_schedules(service_name)
    emit('schedules_data', {
        'service': service_name,
        'schedules': [{
            'id': s[0],
            'schedule_text': s[1],
            'operation': s[2]
        } for s in schedules]
    })


@socketio.on('save_schedule')
def handle_save_schedule(data):
    if not is_authenticated(data.get('session_id')):
        emit('error', {'message': 'Authentication required'})
        return

    service_name = data.get('service')
    schedule_text = data.get('schedule_text')
    operation = data.get('operation')

    if not all([service_name, schedule_text, operation]):
        emit('error', {'message': 'All fields required'})
        return

    save_service_schedule(service_name, schedule_text, operation)
    emit('schedule_updated', {
        'service': service_name,
        'schedule_text': schedule_text,
        'operation': operation
    }, broadcast=True)


@socketio.on('delete_schedule')
def handle_delete_schedule(data):
    if not is_authenticated(data.get('session_id')):
        emit('error', {'message': 'Authentication required'})
        return

    schedule_id = data.get('schedule_id')
    if not schedule_id:
        emit('error', {'message': 'Schedule ID required'})
        return

    delete_service_schedule(schedule_id)
    emit('schedule_deleted', {'schedule_id': schedule_id}, broadcast=True)


if __name__ == '__main__':
    schedule_thread = threading.Thread(target=schedule_checker_loop, daemon=True)
    schedule_thread.start()
    socketio.run(app, port=PORT, debug=DEBUG)
