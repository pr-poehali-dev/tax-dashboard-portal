"""
Авторизация клиентов по client_id и паролю.
Возвращает токен сессии при успешном входе.
"""
import json
import hashlib
import secrets
import os
import psycopg2

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
}

sessions = {}


def handler(event: dict, context) -> dict:
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    if event.get('httpMethod') != 'POST':
        return {'statusCode': 405, 'headers': CORS, 'body': json.dumps({'error': 'Method not allowed'})}

    body = json.loads(event.get('body') or '{}')
    client_id = body.get('client_id', '').strip()
    password = body.get('password', '').strip()

    if not client_id or not password:
        return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'Введите ID и пароль'})}

    password_hash = hashlib.sha256(password.encode()).hexdigest()

    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cur = conn.cursor()
    cur.execute(
        "SELECT id, full_name, inn FROM users WHERE client_id = %s AND password_hash = %s",
        (client_id, password_hash)
    )
    row = cur.fetchone()
    conn.close()

    if not row:
        return {'statusCode': 401, 'headers': CORS, 'body': json.dumps({'error': 'Неверный ID или пароль'})}

    user_id, full_name, inn = row
    token = secrets.token_hex(32)
    sessions[token] = {'user_id': user_id, 'client_id': client_id}

    return {
        'statusCode': 200,
        'headers': CORS,
        'body': json.dumps({
            'token': token,
            'user_id': user_id,
            'client_id': client_id,
            'full_name': full_name,
            'inn': inn,
        })
    }
