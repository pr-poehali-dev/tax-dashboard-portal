"""
Панель администратора: список клиентов, добавление, удаление.
"""
import json
import hashlib
import os
import psycopg2

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password',
}


def check_auth(event):
    headers = event.get('headers') or {}
    pwd = headers.get('X-Admin-Password') or headers.get('x-admin-password') or ''
    return pwd == os.environ.get('ADMIN_PASSWORD', '')


def handler(event: dict, context) -> dict:
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    if not check_auth(event):
        return {'statusCode': 403, 'headers': CORS, 'body': json.dumps({'error': 'Нет доступа'})}

    method = event.get('httpMethod', 'GET')
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cur = conn.cursor()

    # GET — список клиентов
    if method == 'GET':
        cur.execute("""
            SELECT u.id, u.client_id, u.full_name, u.inn, u.created_at,
                   COUNT(DISTINCT r.id) AS records_count
            FROM users u
            LEFT JOIN tax_records r ON r.user_id = u.id
            GROUP BY u.id, u.client_id, u.full_name, u.inn, u.created_at
            ORDER BY u.created_at DESC
        """)
        rows = cur.fetchall()
        conn.close()
        users = [
            {
                'id': r[0],
                'client_id': r[1],
                'full_name': r[2],
                'inn': r[3],
                'created_at': r[4].isoformat() if r[4] else None,
                'records_count': r[5],
            }
            for r in rows
        ]
        return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'users': users})}

    # POST — добавить клиента
    if method == 'POST':
        body = json.loads(event.get('body') or '{}')
        client_id = body.get('client_id', '').strip()
        password = body.get('password', '').strip()
        full_name = body.get('full_name', '').strip()
        inn = body.get('inn', '').strip()

        if not client_id or not password or not full_name:
            conn.close()
            return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'Заполните ID, пароль и ФИО'})}

        cur.execute("SELECT id FROM users WHERE client_id = %s", (client_id,))
        if cur.fetchone():
            conn.close()
            return {'statusCode': 409, 'headers': CORS, 'body': json.dumps({'error': 'Клиент с таким ID уже существует'})}

        password_hash = hashlib.sha256(password.encode()).hexdigest()
        cur.execute(
            "INSERT INTO users (client_id, password_hash, full_name, inn) VALUES (%s, %s, %s, %s) RETURNING id",
            (client_id, password_hash, full_name, inn or None)
        )
        new_id = cur.fetchone()[0]
        conn.commit()
        conn.close()
        return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'success': True, 'user_id': new_id})}

    # DELETE — удалить клиента
    if method == 'DELETE':
        body = json.loads(event.get('body') or '{}')
        user_id = body.get('user_id')
        if not user_id:
            conn.close()
            return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'Укажите user_id'})}
        cur.execute("UPDATE tax_comments SET tax_record_id = NULL WHERE tax_record_id IN (SELECT id FROM tax_records WHERE user_id = %s)", (user_id,))
        cur.execute("UPDATE tax_history SET user_id = NULL WHERE user_id = %s", (user_id,))
        cur.execute("UPDATE tax_records SET user_id = NULL WHERE user_id = %s", (user_id,))
        cur.execute("UPDATE tax_comments SET tax_record_id = NULL WHERE tax_record_id IS NULL")
        cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
        conn.commit()
        conn.close()
        return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'success': True})}

    conn.close()
    return {'statusCode': 405, 'headers': CORS, 'body': json.dumps({'error': 'Method not allowed'})}
