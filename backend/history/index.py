"""
История налоговых операций пользователя.
"""
import json
import os
import psycopg2

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cur = conn.cursor()
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
