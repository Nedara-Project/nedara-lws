# -*- coding: utf-8 -*-

import subprocess
import psutil
from flask import Flask, render_template, request

app = Flask(__name__)
app.config['SECRET_KEY'] = 'palworld3f!flaskappservice'

service_name = "palworld.service"
password = "palworld3f"
systemctl_path = "/bin/systemctl"
sudo_path = "/bin/sudo"

"""
'flasksudo' user to use - HOWTO:
sudo adduser flasksudo
sudo usermod -aG sudo flasksudo
sudo visudo
flasksudo ALL=(ALL:ALL) NOPASSWD:ALL
"""


def _get_system_info():
    gio = 1073741824
    return {
        'cpu_usage_percentage': psutil.cpu_percent(4),
        'virtual_memory_usage_percentage': psutil.virtual_memory()[2],
        'virtual_memory_usage_gb': round(psutil.virtual_memory()[3]/gio, 2),
        'total_virtual_memory_gb': round(psutil.virtual_memory()[0]/gio, 2),
        'swap_memory_usage_percentage': psutil.swap_memory()[3]/gio,
        'swap_memory_usage_gb': round(psutil.swap_memory()[3]/gio, 2),
    }


def _get_service_status(service):
    status_command = [systemctl_path, "status", service]
    result = subprocess.run(status_command, capture_output=True, text=True)
    return result.stdout.strip()


@app.route('/')
def index():
    status = 'You must enter password'
    return render_template('index.html', status=status, system_info={})


@app.route('/action', methods=['POST'])
def perform_action():
    entered_password = request.form.get('password')
    password_status = "is-invalid" if entered_password != password else "is-valid"
    status = 'Wrong password!' if entered_password != password else 'Valid password!'
    system_info = {}
    if entered_password == password:
        action = request.form.get('action')
        if action == "start":
            start_service_command = [sudo_path, "-n", systemctl_path, "start", service_name]
            subprocess.run(start_service_command)
            status = 'The service has started!'
        elif action == "stop":
            stop_service_command = [sudo_path, "-n", systemctl_path, "stop", service_name]
            subprocess.run(stop_service_command)
            status = 'The service has been stopped!'
        elif action == "status":
            status = _get_service_status(service_name)
        elif action == "system_info":
            system_info = _get_system_info()
    return render_template('index.html', status=status, password_status=password_status, system_info=system_info)


if __name__ == '__main__':
    app.run(app, debug=True)
