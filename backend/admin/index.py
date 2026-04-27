"""
Панель администратора: список клиентов, добавление, удаление, управление налоговыми записями, статистика.
"""
import json
import hashlib
import os
import psycopg2

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password, X-Action, X-Authorization',
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
    headers = event.get('headers') or {}
    action = headers.get('X-Action') or headers.get('x-action') or ''

    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cur = conn.cursor()

    # GET — список клиентов, записи клиента или статистика
    if method == 'GET':
        params = event.get('queryStringParameters') or {}
        user_id = params.get('user_id')

        # Статистика
        if params.get('action') == 'stats':
            cur.execute("""
                SELECT COALESCE(SUM(amount), 0) FROM tax_records
                WHERE status = 'paid'
                  AND DATE_TRUNC('month', updated_at) = DATE_TRUNC('month', NOW())
            """)
            paid_month = float(cur.fetchone()[0])

            cur.execute("""
                SELECT COALESCE(SUM(amount), 0) FROM tax_records
                WHERE status = 'paid'
                  AND DATE_TRUNC('year', updated_at) = DATE_TRUNC('year', NOW())
            """)
            paid_year = float(cur.fetchone()[0])

            cur.execute("SELECT COALESCE(SUM(amount), 0) FROM tax_records WHERE status = 'paid'")
            paid_total = float(cur.fetchone()[0])

            cur.execute("SELECT COALESCE(SUM(amount), 0) FROM tax_records WHERE status = 'pending'")
            pending_total = float(cur.fetchone()[0])

            cur.execute("SELECT COALESCE(SUM(amount), 0) FROM tax_records WHERE status = 'overdue'")
            overdue_total = float(cur.fetchone()[0])

            cur.execute("SELECT COUNT(*) FROM users")
            clients_count = int(cur.fetchone()[0])

            cur.execute("SELECT status, COUNT(*) FROM tax_records GROUP BY status")
            status_counts = {row[0]: int(row[1]) for row in cur.fetchall()}

            cur.execute("SELECT COUNT(*) FROM support_messages WHERE author = 'client' AND is_read = FALSE")
            unread_support = int(cur.fetchone()[0])

            cur.execute("""
                SELECT TO_CHAR(DATE_TRUNC('month', updated_at), 'YYYY-MM') AS month,
                       COALESCE(SUM(amount), 0) AS total
                FROM tax_records
                WHERE status = 'paid' AND updated_at >= NOW() - INTERVAL '12 months'
                GROUP BY month ORDER BY month
            """)
            monthly = [{'month': r[0], 'total': float(r[1])} for r in cur.fetchall()]

            conn.close()
            return {
                'statusCode': 200,
                'headers': CORS,
                'body': json.dumps({
                    'paid_month': paid_month,
                    'paid_year': paid_year,
                    'paid_total': paid_total,
                    'pending_total': pending_total,
                    'overdue_total': overdue_total,
                    'clients_count': clients_count,
                    'status_counts': status_counts,
                    'unread_support': unread_support,
                    'monthly': monthly,
                })
            }

        if user_id:
            cur.execute("""
                SELECT id, tax_type, period, amount, status, due_date, description, created_at
                FROM tax_records
                WHERE user_id = %s
                ORDER BY created_at DESC
            """, (user_id,))
            rows = cur.fetchall()
            conn.close()
            records = [
                {
                    'id': r[0], 'tax_type': r[1], 'period': r[2],
                    'amount': float(r[3]), 'status': r[4],
                    'due_date': r[5].isoformat() if r[5] else None,
                    'description': r[6],
                    'created_at': r[7].isoformat() if r[7] else None,
                }
                for r in rows
            ]
            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'records': records})}

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
                'id': r[0], 'client_id': r[1], 'full_name': r[2],
                'inn': r[3], 'created_at': r[4].isoformat() if r[4] else None,
                'records_count': r[5],
            }
            for r in rows
        ]
        return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'users': users})}

    # POST — добавить клиента или налоговую запись
    if method == 'POST':
        body = json.loads(event.get('body') or '{}')

        if action == 'add_tax_record':
            user_id = body.get('user_id')
            tax_type = body.get('tax_type', '').strip()
            period = body.get('period', '').strip()
            amount = body.get('amount')
            status = body.get('status', 'pending')
            due_date = body.get('due_date') or None
            description = body.get('description', '').strip() or None

            if not user_id or not tax_type or not period or amount is None:
                conn.close()
                return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'Заполните тип, период и сумму'})}

            cur.execute(
                "INSERT INTO tax_records (user_id, tax_type, period, amount, status, due_date, description) VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id",
                (user_id, tax_type, period, amount, status, due_date, description)
            )
            new_id = cur.fetchone()[0]
            conn.commit()
            conn.close()
            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'success': True, 'record_id': new_id})}

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

    # PUT — обновить статус налоговой записи
    if method == 'PUT':
        body = json.loads(event.get('body') or '{}')
        record_id = body.get('record_id')
        new_status = body.get('status', '').strip()
        allowed = ('pending', 'paid', 'overdue', 'cancelled')
        if not record_id or new_status not in allowed:
            conn.close()
            return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'Укажите record_id и корректный статус'})}
        cur.execute("UPDATE tax_records SET status = %s, updated_at = now() WHERE id = %s", (new_status, record_id))
        conn.commit()
        conn.close()
        return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'success': True})}

    # DELETE — удалить клиента или налоговую запись
    if method == 'DELETE':
        body = json.loads(event.get('body') or '{}')

        if action == 'delete_tax_record':
            record_id = body.get('record_id')
            if not record_id:
                conn.close()
                return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'Укажите record_id'})}
            cur.execute("DELETE FROM tax_records WHERE id = %s", (record_id,))
            conn.commit()
            conn.close()
            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'success': True})}

        user_id = body.get('user_id')
        if not user_id:
            conn.close()
            return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'Укажите user_id'})}
        cur.execute("UPDATE tax_comments SET tax_record_id = NULL WHERE tax_record_id IN (SELECT id FROM tax_records WHERE user_id = %s)", (user_id,))
        cur.execute("UPDATE tax_history SET user_id = NULL WHERE user_id = %s", (user_id,))
        cur.execute("DELETE FROM tax_records WHERE user_id = %s", (user_id,))
        cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
        conn.commit()
        conn.close()
        return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'success': True})}

    conn.close()
    return {'statusCode': 405, 'headers': CORS, 'body': json.dumps({'error': 'Method not allowed'})}
