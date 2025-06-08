# -*- coding: utf-8 -*-

import sqlite3
from contextlib import contextmanager

DATABASE_PATH = "lws-scheduler.db"


@contextmanager
def get_db_connection():
    conn = sqlite3.connect(DATABASE_PATH)
    try:
        yield conn
    finally:
        conn.close()


def init_db():
    with get_db_connection() as conn:
        conn.execute("""
        CREATE TABLE IF NOT EXISTS service_schedules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            service_name TEXT NOT NULL,
            schedule_text TEXT NOT NULL,
            operation TEXT NOT NULL,
            UNIQUE(service_name, schedule_text, operation))
        """)
        conn.commit()


def get_service_schedules(service_name):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
        SELECT id, schedule_text, operation FROM service_schedules
        WHERE service_name = ?
        ORDER BY schedule_text
        """, (service_name,))
        return cursor.fetchall()


def save_service_schedule(service_name, schedule_text, operation):
    with get_db_connection() as conn:
        conn.execute("""
        INSERT OR IGNORE INTO service_schedules
        (service_name, schedule_text, operation)
        VALUES (?, ?, ?)
        """, (service_name, schedule_text, operation))
        conn.commit()


def delete_service_schedule(schedule_id):
    with get_db_connection() as conn:
        conn.execute("""
        DELETE FROM service_schedules
        WHERE id = ?
        """, (schedule_id,))
        conn.commit()
