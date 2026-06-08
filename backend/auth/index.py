"""
Авторизация и регистрация пользователей.
POST / { action: 'login', client_id, password } — вход
POST / { action: 'register', client_id, password, full_name, inn? } — регистрация
"""
import json
import hashlib
import secrets
import re
import os
import psycopg2

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
}


def handler(event: dict, context) -> dict:
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    if event.get('httpMethod') != 'POST':
        return {'statusCode': 405, 'headers': CORS, 'body': json.dumps({'error': 'Method not allowed'})}

    body = json.loads(event.get('body') or '{}')
    action = body.get('action', 'login')

    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cur = conn.cursor()

    # ===== РЕГИСТРАЦИЯ =====
    if action == 'register':
        client_id = body.get('client_id', '').strip()
        password = body.get('password', '').strip()
        full_name = body.get('full_name', '').strip()
        inn = body.get('inn', '').strip() or None

        if not client_id or not password or not full_name:
            conn.close()
            return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'Заполните все обязательные поля'})}

        if len(client_id) < 3:
            conn.close()
            return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'Логин должен быть не менее 3 символов'})}

        if len(password) < 6:
            conn.close()
            return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'Пароль должен быть не менее 6 символов'})}

        if not re.match(r'^[a-zA-Z0-9_\-\.]+$', client_id):
            conn.close()
            return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'Логин: только буквы, цифры, _ и -'})}

        # Проверяем уникальность
        cur.execute("SELECT id FROM users WHERE client_id = %s", (client_id,))
        if cur.fetchone():
            conn.close()
            return {'statusCode': 409, 'headers': CORS, 'body': json.dumps({'error': 'Такой логин уже занят'})}

        password_hash = hashlib.sha256(password.encode()).hexdigest()
        cur.execute(
            "INSERT INTO users (client_id, password_hash, full_name, inn) VALUES (%s, %s, %s, %s) RETURNING id",
            (client_id, password_hash, full_name, inn)
        )
        user_id = cur.fetchone()[0]
        conn.commit()
        conn.close()

        token = secrets.token_hex(32)
        return {
            'statusCode': 200, 'headers': CORS,
            'body': json.dumps({
                'token': token,
                'user_id': user_id,
                'client_id': client_id,
                'full_name': full_name,
                'inn': inn or '',
            })
        }

    # ===== ВХОД =====
    client_id = body.get('client_id', '').strip()
    password = body.get('password', '').strip()

    if not client_id or not password:
        conn.close()
        return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'Введите логин и пароль'})}

    password_hash = hashlib.sha256(password.encode()).hexdigest()
    cur.execute(
        "SELECT id, full_name, inn FROM users WHERE client_id = %s AND password_hash = %s",
        (client_id, password_hash)
    )
    row = cur.fetchone()
    conn.close()

    if not row:
        return {'statusCode': 401, 'headers': CORS, 'body': json.dumps({'error': 'Неверный логин или пароль'})}

    user_id, full_name, inn = row
    token = secrets.token_hex(32)

    return {
        'statusCode': 200, 'headers': CORS,
        'body': json.dumps({
            'token': token,
            'user_id': user_id,
            'client_id': client_id,
            'full_name': full_name,
            'inn': inn or '',
        })
    }
