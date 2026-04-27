"""
Панель администратора: клиенты, налоговые записи, статистика, заметки, штрафы, отчёт.
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

    # ==================== GET ====================
    if method == 'GET':
        params = event.get('queryStringParameters') or {}
        act = params.get('action', '')

        # --- Статистика ---
        if act == 'stats':
            cur.execute("""
                SELECT COALESCE(SUM(amount), 0) FROM tax_records
                WHERE status = 'paid' AND DATE_TRUNC('month', updated_at) = DATE_TRUNC('month', NOW())
            """)
            paid_month = float(cur.fetchone()[0])

            cur.execute("""
                SELECT COALESCE(SUM(amount), 0) FROM tax_records
                WHERE status = 'paid' AND DATE_TRUNC('year', updated_at) = DATE_TRUNC('year', NOW())
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
                'statusCode': 200, 'headers': CORS,
                'body': json.dumps({
                    'paid_month': paid_month, 'paid_year': paid_year, 'paid_total': paid_total,
                    'pending_total': pending_total, 'overdue_total': overdue_total,
                    'clients_count': clients_count, 'status_counts': status_counts,
                    'unread_support': unread_support, 'monthly': monthly,
                })
            }

        # --- Отчёт по клиенту (или по всем) ---
        if act == 'report':
            user_id = params.get('user_id')
            if user_id:
                cur.execute("""
                    SELECT u.full_name, u.client_id, u.inn,
                           r.tax_type, r.period, r.amount, r.status, r.due_date, r.description,
                           COALESCE(f.amount, 0) as fine_amount
                    FROM users u
                    JOIN tax_records r ON r.user_id = u.id
                    LEFT JOIN fines f ON f.tax_record_id = r.id AND f.status = 'unpaid'
                    WHERE u.id = %s
                    ORDER BY r.created_at DESC
                """, (user_id,))
                rows = cur.fetchall()
                conn.close()
                records = [{
                    'full_name': r[0], 'client_id': r[1], 'inn': r[2],
                    'tax_type': r[3], 'period': r[4], 'amount': float(r[5]),
                    'status': r[6], 'due_date': r[7].isoformat() if r[7] else None,
                    'description': r[8], 'fine_amount': float(r[9])
                } for r in rows]
                return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'report': records})}

            # Сводный отчёт по всем
            cur.execute("""
                SELECT u.full_name, u.client_id, u.inn,
                       COUNT(r.id) as records_count,
                       COALESCE(SUM(CASE WHEN r.status='paid' THEN r.amount ELSE 0 END), 0) as paid,
                       COALESCE(SUM(CASE WHEN r.status='pending' THEN r.amount ELSE 0 END), 0) as pending,
                       COALESCE(SUM(CASE WHEN r.status='overdue' THEN r.amount ELSE 0 END), 0) as overdue,
                       COALESCE((SELECT SUM(f.amount) FROM fines f JOIN tax_records tr ON f.tax_record_id=tr.id WHERE tr.user_id=u.id AND f.status='unpaid'), 0) as fines
                FROM users u
                LEFT JOIN tax_records r ON r.user_id = u.id
                GROUP BY u.id, u.full_name, u.client_id, u.inn
                ORDER BY u.full_name
            """)
            rows = cur.fetchall()
            conn.close()
            summary = [{
                'full_name': r[0], 'client_id': r[1], 'inn': r[2],
                'records_count': int(r[3]), 'paid': float(r[4]),
                'pending': float(r[5]), 'overdue': float(r[6]), 'fines': float(r[7])
            } for r in rows]
            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'summary': summary})}

        # --- Заметки ---
        if act == 'notes':
            user_id = params.get('user_id')
            if user_id:
                cur.execute("SELECT id, user_id, title, content, color, created_at FROM admin_notes WHERE user_id = %s ORDER BY created_at DESC", (user_id,))
            else:
                cur.execute("SELECT id, user_id, title, content, color, created_at FROM admin_notes ORDER BY created_at DESC")
            rows = cur.fetchall()
            conn.close()
            notes = [{'id': r[0], 'user_id': r[1], 'title': r[2], 'content': r[3], 'color': r[4], 'created_at': r[5].isoformat()} for r in rows]
            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'notes': notes})}

        # --- Штрафы ---
        if act == 'fines':
            user_id = params.get('user_id')
            if user_id:
                cur.execute("""
                    SELECT f.id, f.user_id, f.tax_record_id, f.reason, f.amount, f.status, f.due_date, f.created_at,
                           r.tax_type, r.period
                    FROM fines f
                    LEFT JOIN tax_records r ON f.tax_record_id = r.id
                    WHERE f.user_id = %s ORDER BY f.created_at DESC
                """, (user_id,))
            else:
                cur.execute("""
                    SELECT f.id, f.user_id, f.tax_record_id, f.reason, f.amount, f.status, f.due_date, f.created_at,
                           r.tax_type, r.period
                    FROM fines f
                    LEFT JOIN tax_records r ON f.tax_record_id = r.id
                    ORDER BY f.created_at DESC
                """)
            rows = cur.fetchall()
            conn.close()
            fines = [{
                'id': r[0], 'user_id': r[1], 'tax_record_id': r[2], 'reason': r[3],
                'amount': float(r[4]), 'status': r[5],
                'due_date': r[6].isoformat() if r[6] else None,
                'created_at': r[7].isoformat(), 'tax_type': r[8], 'period': r[9]
            } for r in rows]
            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'fines': fines})}

        # --- Список клиентов или записей конкретного ---
        user_id = params.get('user_id')
        if user_id:
            cur.execute("""
                SELECT id, tax_type, period, amount, status, due_date, description, created_at
                FROM tax_records WHERE user_id = %s ORDER BY created_at DESC
            """, (user_id,))
            rows = cur.fetchall()
            conn.close()
            records = [{'id': r[0], 'tax_type': r[1], 'period': r[2], 'amount': float(r[3]),
                        'status': r[4], 'due_date': r[5].isoformat() if r[5] else None,
                        'description': r[6], 'created_at': r[7].isoformat() if r[7] else None}
                       for r in rows]
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
        users = [{'id': r[0], 'client_id': r[1], 'full_name': r[2], 'inn': r[3],
                  'created_at': r[4].isoformat() if r[4] else None, 'records_count': r[5]}
                 for r in rows]
        return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'users': users})}

    # ==================== POST ====================
    if method == 'POST':
        body = json.loads(event.get('body') or '{}')

        # Добавить налоговую запись
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

        # Добавить заметку
        if action == 'add_note':
            user_id = body.get('user_id') or None
            title = body.get('title', '').strip()
            content = body.get('content', '').strip()
            color = body.get('color', 'yellow')
            if not title or not content:
                conn.close()
                return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'Заполните заголовок и текст'})}
            cur.execute(
                "INSERT INTO admin_notes (user_id, title, content, color) VALUES (%s, %s, %s, %s) RETURNING id",
                (user_id, title, content, color)
            )
            new_id = cur.fetchone()[0]
            conn.commit()
            conn.close()
            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'success': True, 'note_id': new_id})}

        # Назначить штраф
        if action == 'add_fine':
            user_id = body.get('user_id')
            tax_record_id = body.get('tax_record_id') or None
            reason = body.get('reason', '').strip()
            amount = body.get('amount')
            due_date = body.get('due_date') or None
            if not user_id or not reason or amount is None:
                conn.close()
                return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'Укажите причину и сумму'})}
            cur.execute(
                "INSERT INTO fines (user_id, tax_record_id, reason, amount, due_date) VALUES (%s, %s, %s, %s, %s) RETURNING id",
                (user_id, tax_record_id, reason, amount, due_date)
            )
            new_id = cur.fetchone()[0]
            conn.commit()
            conn.close()
            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'success': True, 'fine_id': new_id})}

        # Добавить клиента
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

    # ==================== PUT ====================
    if method == 'PUT':
        body = json.loads(event.get('body') or '{}')

        # Обновить статус штрафа
        if action == 'update_fine':
            fine_id = body.get('fine_id')
            new_status = body.get('status', '')
            if not fine_id or new_status not in ('unpaid', 'paid', 'cancelled'):
                conn.close()
                return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'Неверные параметры'})}
            cur.execute("UPDATE fines SET status = %s WHERE id = %s", (new_status, fine_id))
            conn.commit()
            conn.close()
            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'success': True})}

        # Обновить заметку
        if action == 'update_note':
            note_id = body.get('note_id')
            title = body.get('title', '').strip()
            content = body.get('content', '').strip()
            color = body.get('color', 'yellow')
            if not note_id:
                conn.close()
                return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'Укажите note_id'})}
            cur.execute("UPDATE admin_notes SET title=%s, content=%s, color=%s, updated_at=now() WHERE id=%s",
                        (title, content, color, note_id))
            conn.commit()
            conn.close()
            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'success': True})}

        # Обновить статус налоговой записи
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

    # ==================== DELETE ====================
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

        if action == 'delete_note':
            note_id = body.get('note_id')
            if not note_id:
                conn.close()
                return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'Укажите note_id'})}
            cur.execute("DELETE FROM admin_notes WHERE id = %s", (note_id,))
            conn.commit()
            conn.close()
            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'success': True})}

        if action == 'delete_fine':
            fine_id = body.get('fine_id')
            if not fine_id:
                conn.close()
                return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'Укажите fine_id'})}
            cur.execute("DELETE FROM fines WHERE id = %s", (fine_id,))
            conn.commit()
            conn.close()
            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'success': True})}

        user_id = body.get('user_id')
        if not user_id:
            conn.close()
            return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'Укажите user_id'})}
        cur.execute("UPDATE tax_comments SET tax_record_id = NULL WHERE tax_record_id IN (SELECT id FROM tax_records WHERE user_id = %s)", (user_id,))
        cur.execute("UPDATE tax_history SET user_id = NULL WHERE user_id = %s", (user_id,))
        cur.execute("DELETE FROM fines WHERE user_id = %s", (user_id,))
        cur.execute("DELETE FROM admin_notes WHERE user_id = %s", (user_id,))
        cur.execute("DELETE FROM tax_records WHERE user_id = %s", (user_id,))
        cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
        conn.commit()
        conn.close()
        return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'success': True})}

    conn.close()
    return {'statusCode': 405, 'headers': CORS, 'body': json.dumps({'error': 'Method not allowed'})}
