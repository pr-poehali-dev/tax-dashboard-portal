"""
Чат поддержки: клиент пишет сообщения администратору, администратор отвечает.
"""
import json
import os
import psycopg2

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password, X-User-Id',
}


def is_admin(event):
    headers = event.get('headers') or {}
    pwd = headers.get('X-Admin-Password') or headers.get('x-admin-password') or ''
    return pwd == os.environ.get('ADMIN_PASSWORD', '')


def get_user_id(event):
    headers = event.get('headers') or {}
    val = headers.get('X-User-Id') or headers.get('x-user-id') or ''
    try:
        return int(val)
    except Exception:
        return None


def handler(event: dict, context) -> dict:
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    method = event.get('httpMethod', 'GET')
    admin = is_admin(event)
    user_id = get_user_id(event)
    params = event.get('queryStringParameters') or {}

    if not admin and not user_id:
        return {'statusCode': 403, 'headers': CORS, 'body': json.dumps({'error': 'Нет доступа'})}

    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cur = conn.cursor()

    if method == 'GET':
        # Администратор — получить все диалоги (список клиентов с последним сообщением)
        if admin and not params.get('user_id'):
            cur.execute("""
                SELECT u.id, u.client_id, u.full_name,
                       (SELECT message FROM support_messages WHERE user_id = u.id ORDER BY created_at DESC LIMIT 1) AS last_msg,
                       (SELECT created_at FROM support_messages WHERE user_id = u.id ORDER BY created_at DESC LIMIT 1) AS last_at,
                       (SELECT COUNT(*) FROM support_messages WHERE user_id = u.id AND author = 'client' AND is_read = FALSE) AS unread
                FROM users u
                WHERE EXISTS (SELECT 1 FROM support_messages WHERE user_id = u.id)
                ORDER BY last_at DESC NULLS LAST
            """)
            rows = cur.fetchall()
            conn.close()
            return {
                'statusCode': 200,
                'headers': CORS,
                'body': json.dumps({'dialogs': [
                    {'user_id': r[0], 'client_id': r[1], 'full_name': r[2],
                     'last_msg': r[3], 'last_at': r[4].isoformat() if r[4] else None,
                     'unread': int(r[5])}
                    for r in rows
                ]})
            }

        # Получить сообщения конкретного диалога
        target_id = int(params.get('user_id', 0)) if admin else user_id

        # Пометить как прочитанные
        if admin:
            cur.execute("UPDATE support_messages SET is_read = TRUE WHERE user_id = %s AND author = 'client'", (target_id,))
        else:
            cur.execute("UPDATE support_messages SET is_read = TRUE WHERE user_id = %s AND author = 'admin'", (target_id,))
        conn.commit()

        cur.execute("""
            SELECT id, author, message, is_read, created_at
            FROM support_messages
            WHERE user_id = %s
            ORDER BY created_at ASC
        """, (target_id,))
        rows = cur.fetchall()
        conn.close()
        return {
            'statusCode': 200,
            'headers': CORS,
            'body': json.dumps({'messages': [
                {'id': r[0], 'author': r[1], 'message': r[2], 'is_read': r[3],
                 'created_at': r[4].isoformat() if r[4] else None}
                for r in rows
            ]})
        }

    if method == 'POST':
        body = json.loads(event.get('body') or '{}')
        message = (body.get('message') or '').strip()
        if not message:
            conn.close()
            return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'Сообщение не может быть пустым'})}

        if admin:
            target_id = body.get('user_id')
            if not target_id:
                conn.close()
                return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'Укажите user_id'})}
            cur.execute(
                "INSERT INTO support_messages (user_id, author, message) VALUES (%s, 'admin', %s) RETURNING id",
                (target_id, message)
            )
        else:
            cur.execute(
                "INSERT INTO support_messages (user_id, author, message) VALUES (%s, 'client', %s) RETURNING id",
                (user_id, message)
            )
        new_id = cur.fetchone()[0]
        conn.commit()
        conn.close()
        return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'success': True, 'id': new_id})}

    conn.close()
    return {'statusCode': 405, 'headers': CORS, 'body': json.dumps({'error': 'Method not allowed'})}
