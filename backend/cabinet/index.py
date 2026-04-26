"""
Получение данных личного кабинета: налоговые записи, история, комментарии.
"""
import json
import os
import psycopg2

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-User-Id',
}


def get_user_id(event):
    headers = event.get('headers') or {}
    return headers.get('X-User-Id') or headers.get('x-user-id')


def handler(event: dict, context) -> dict:
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    user_id = get_user_id(event)
    if not user_id:
        return {'statusCode': 401, 'headers': CORS, 'body': json.dumps({'error': 'Не авторизован'})}

    path = event.get('path', '/')
    method = event.get('httpMethod', 'GET')

    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cur = conn.cursor()

    # POST /comment — добавить комментарий
    if method == 'POST' and path.endswith('/comment'):
        body = json.loads(event.get('body') or '{}')
        record_id = body.get('record_id')
        comment_text = body.get('comment', '').strip()
        if not record_id or not comment_text:
            conn.close()
            return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'Укажите запись и комментарий'})}
        cur.execute(
            "INSERT INTO tax_comments (tax_record_id, author, comment) VALUES (%s, 'Клиент', %s)",
            (record_id, comment_text)
        )
        conn.commit()
        conn.close()
        return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'success': True})}

    # GET /history — история операций
    if path.endswith('/history'):
        cur.execute(
            """SELECT id, operation_type, tax_type, amount, period, description, occurred_at
               FROM tax_history WHERE user_id = %s ORDER BY occurred_at DESC""",
            (user_id,)
        )
        rows = cur.fetchall()
        conn.close()
        history = [
            {
                'id': r[0],
                'operation_type': r[1],
                'tax_type': r[2],
                'amount': float(r[3]) if r[3] else None,
                'period': r[4],
                'description': r[5],
                'occurred_at': r[6].isoformat() if r[6] else None,
            }
            for r in rows
        ]
        return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'history': history})}

    # GET / — налоговые записи с комментариями
    cur.execute(
        """SELECT id, tax_type, period, amount, status, due_date, description, created_at
           FROM tax_records WHERE user_id = %s ORDER BY created_at DESC""",
        (user_id,)
    )
    records = cur.fetchall()

    result = []
    for r in records:
        rid = r[0]
        cur.execute(
            "SELECT id, author, comment, created_at FROM tax_comments WHERE tax_record_id = %s ORDER BY created_at",
            (rid,)
        )
        comments = [
            {'id': c[0], 'author': c[1], 'comment': c[2], 'created_at': c[3].isoformat() if c[3] else None}
            for c in cur.fetchall()
        ]
        result.append({
            'id': rid,
            'tax_type': r[1],
            'period': r[2],
            'amount': float(r[3]),
            'status': r[4],
            'due_date': r[5].isoformat() if r[5] else None,
            'description': r[6],
            'created_at': r[7].isoformat() if r[7] else None,
            'comments': comments,
        })

    conn.close()
    return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'records': result})}
