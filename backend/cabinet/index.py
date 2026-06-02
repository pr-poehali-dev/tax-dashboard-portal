"""
Личный кабинет: записи, история, комментарии, кредиты, вклады, карты, магазин, заказы.
Использует tax_records с префиксами в tax_type:
  __credit__  — кредиты
  __deposit__ — вклады
  __card__    — карты
  __order__   — заказы магазина
  __product__ — товары магазина (user_id=NULL — общий каталог)
  __payment__ — платежи/налоги онлайн
"""
import json
import os
import psycopg2

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-User-Id, X-Action',
}


def get_user_id(event):
    headers = event.get('headers') or {}
    return headers.get('X-User-Id') or headers.get('x-user-id')


def get_action(event):
    headers = event.get('headers') or {}
    return headers.get('X-Action') or headers.get('x-action') or ''


def handler(event: dict, context) -> dict:
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    method = event.get('httpMethod', 'GET')
    action = get_action(event)
    params = event.get('queryStringParameters') or {}

    # Магазин — каталог публичный (без авторизации)
    if method == 'GET' and params.get('action') == 'catalog':
        conn = psycopg2.connect(os.environ['DATABASE_URL'])
        cur = conn.cursor()
        cur.execute("""
            SELECT id, tax_type, period, amount, status, due_date, description, created_at
            FROM tax_records WHERE tax_type = '__product__' AND status = 'pending'
            ORDER BY created_at DESC
        """)
        rows = cur.fetchall()
        conn.close()
        products = [{
            'id': r[0], 'name': r[2], 'price': float(r[3]),
            'status': r[4], 'image_url': r[5], 'description': r[6],
            'created_at': r[7].isoformat() if r[7] else None,
        } for r in rows]
        return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'products': products})}

    user_id = get_user_id(event)
    if not user_id:
        return {'statusCode': 401, 'headers': CORS, 'body': json.dumps({'error': 'Не авторизован'})}

    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cur = conn.cursor()

    # ======= GET =======
    if method == 'GET':
        act = params.get('action', '')

        # Кредиты игрока
        if act == 'credits':
            cur.execute("""
                SELECT id, period, amount, status, due_date, description, created_at, updated_at
                FROM tax_records WHERE user_id = %s AND tax_type = '__credit__' ORDER BY created_at DESC
            """, (user_id,))
            rows = cur.fetchall()
            conn.close()
            credits = [{
                'id': r[0], 'title': r[1], 'amount': float(r[2]), 'status': r[3],
                'due_date': r[4].isoformat() if r[4] else None,
                'description': r[5],
                'created_at': r[6].isoformat() if r[6] else None,
                'updated_at': r[7].isoformat() if r[7] else None,
            } for r in rows]
            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'credits': credits})}

        # Вклады игрока
        if act == 'deposits':
            cur.execute("""
                SELECT id, period, amount, status, due_date, description, created_at, updated_at
                FROM tax_records WHERE user_id = %s AND tax_type = '__deposit__' ORDER BY created_at DESC
            """, (user_id,))
            rows = cur.fetchall()
            conn.close()
            deposits = [{
                'id': r[0], 'title': r[1], 'amount': float(r[2]), 'status': r[3],
                'due_date': r[4].isoformat() if r[4] else None,
                'description': r[5],
                'created_at': r[6].isoformat() if r[6] else None,
                'updated_at': r[7].isoformat() if r[7] else None,
            } for r in rows]
            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'deposits': deposits})}

        # Карты игрока
        if act == 'cards':
            cur.execute("""
                SELECT id, period, amount, status, due_date, description, created_at
                FROM tax_records WHERE user_id = %s AND tax_type = '__card__' ORDER BY created_at DESC
            """, (user_id,))
            rows = cur.fetchall()
            conn.close()
            cards = [{
                'id': r[0], 'card_number': r[1], 'balance': float(r[2]),
                'status': r[3], 'expiry': r[4].isoformat() if r[4] else None,
                'description': r[5],
                'created_at': r[6].isoformat() if r[6] else None,
            } for r in rows]
            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'cards': cards})}

        # Заказы игрока
        if act == 'orders':
            cur.execute("""
                SELECT id, period, amount, status, due_date, description, created_at
                FROM tax_records WHERE user_id = %s AND tax_type = '__order__' ORDER BY created_at DESC
            """, (user_id,))
            rows = cur.fetchall()
            conn.close()
            orders = [{
                'id': r[0], 'items': r[1], 'total': float(r[2]),
                'status': r[3],
                'address': r[4],
                'description': r[5],
                'created_at': r[6].isoformat() if r[6] else None,
            } for r in rows]
            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'orders': orders})}

        # История платежей
        if act == 'payments':
            cur.execute("""
                SELECT id, period, amount, status, due_date, description, created_at
                FROM tax_records WHERE user_id = %s AND tax_type = '__payment__' ORDER BY created_at DESC
            """, (user_id,))
            rows = cur.fetchall()
            conn.close()
            payments = [{
                'id': r[0], 'purpose': r[1], 'amount': float(r[2]),
                'status': r[3], 'paid_at': r[4].isoformat() if r[4] else None,
                'description': r[5],
                'created_at': r[6].isoformat() if r[6] else None,
            } for r in rows]
            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'payments': payments})}

        # История операций
        if act == 'history':
            cur.execute(
                """SELECT id, operation_type, tax_type, amount, period, description, occurred_at
                   FROM tax_history WHERE user_id = %s ORDER BY occurred_at DESC""",
                (user_id,)
            )
            rows = cur.fetchall()
            conn.close()
            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'history': [{
                'id': r[0], 'operation_type': r[1], 'tax_type': r[2],
                'amount': float(r[3]) if r[3] else None,
                'period': r[4], 'description': r[5],
                'occurred_at': r[6].isoformat() if r[6] else None,
            } for r in rows]})}

        # Основные записи (инвентарь, активы)
        cur.execute("""
            SELECT id, tax_type, period, amount, status, due_date, description, created_at
            FROM tax_records WHERE user_id = %s
              AND tax_type NOT IN ('__credit__','__deposit__','__card__','__order__','__product__','__payment__')
            ORDER BY created_at DESC
        """, (user_id,))
        records = cur.fetchall()
        result = []
        for r in records:
            rid = r[0]
            cur.execute(
                "SELECT id, author, comment, created_at FROM tax_comments WHERE tax_record_id = %s ORDER BY created_at",
                (rid,)
            )
            comments = [{'id': c[0], 'author': c[1], 'comment': c[2], 'created_at': c[3].isoformat() if c[3] else None} for c in cur.fetchall()]
            result.append({
                'id': rid, 'tax_type': r[1], 'period': r[2], 'amount': float(r[3]),
                'status': r[4], 'due_date': r[5].isoformat() if r[5] else None,
                'description': r[6], 'created_at': r[7].isoformat() if r[7] else None,
                'comments': comments,
            })
        conn.close()
        return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'records': result})}

    # ======= POST =======
    if method == 'POST':
        body = json.loads(event.get('body') or '{}')

        # Добавить комментарий
        if action == 'add_comment':
            record_id = body.get('record_id')
            comment_text = body.get('comment', '').strip()
            if not record_id or not comment_text:
                conn.close()
                return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'Укажите запись и комментарий'})}
            cur.execute("INSERT INTO tax_comments (tax_record_id, author, comment) VALUES (%s, 'Игрок', %s)", (record_id, comment_text))
            conn.commit()
            conn.close()
            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'success': True})}

        # Заявка на кредит
        if action == 'apply_credit':
            title = body.get('title', 'Кредит').strip()
            amount = body.get('amount')
            description = body.get('description', '')
            if not amount:
                conn.close()
                return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'Укажите сумму'})}
            cur.execute(
                "INSERT INTO tax_records (user_id, tax_type, period, amount, status, description) VALUES (%s, '__credit__', %s, %s, 'pending', %s) RETURNING id",
                (user_id, title, amount, f'[ЗАЯВКА] {description}')
            )
            new_id = cur.fetchone()[0]
            conn.commit()
            conn.close()
            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'success': True, 'id': new_id})}

        # Открыть вклад
        if action == 'open_deposit':
            title = body.get('title', 'Вклад').strip()
            amount = body.get('amount')
            duration = body.get('duration', '12 мес.')
            rate = body.get('rate', 5)
            if not amount:
                conn.close()
                return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'Укажите сумму'})}
            cur.execute(
                "INSERT INTO tax_records (user_id, tax_type, period, amount, status, description) VALUES (%s, '__deposit__', %s, %s, 'pending', %s) RETURNING id",
                (user_id, title, amount, f'Ставка: {rate}% · Срок: {duration}')
            )
            new_id = cur.fetchone()[0]
            conn.commit()
            conn.close()
            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'success': True, 'id': new_id})}

        # Заявка на карту
        if action == 'apply_card':
            card_type = body.get('card_type', 'Стандартная')
            import random, string
            card_number = '**** **** **** ' + ''.join(random.choices(string.digits, k=4))
            cur.execute(
                "INSERT INTO tax_records (user_id, tax_type, period, amount, status, description) VALUES (%s, '__card__', %s, %s, 'pending', %s) RETURNING id",
                (user_id, card_number, 0, f'Тип: {card_type} · Заявка на рассмотрении')
            )
            new_id = cur.fetchone()[0]
            conn.commit()
            conn.close()
            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'success': True, 'id': new_id, 'card_number': card_number})}

        # Создать заказ в магазине
        if action == 'place_order':
            items = body.get('items', '')
            total = body.get('total', 0)
            address = body.get('address', '').strip()
            phone = body.get('phone', '').strip()
            comment = body.get('comment', '')
            if not address or not items:
                conn.close()
                return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'Укажите товары и адрес доставки'})}
            cur.execute(
                "INSERT INTO tax_records (user_id, tax_type, period, amount, status, due_date, description) VALUES (%s, '__order__', %s, %s, 'pending', %s, %s) RETURNING id",
                (user_id, items, total, address, f'Тел: {phone} | {comment}')
            )
            new_id = cur.fetchone()[0]
            conn.commit()
            conn.close()
            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'success': True, 'order_id': new_id})}

        # Онлайн-оплата (налог/штраф/сбор)
        if action == 'pay_online':
            purpose = body.get('purpose', '').strip()
            amount = body.get('amount')
            record_id = body.get('record_id')
            card_holder = body.get('card_holder', '')
            if not purpose or not amount:
                conn.close()
                return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'Укажите назначение и сумму'})}
            # Сохраняем платёж
            cur.execute(
                "INSERT INTO tax_records (user_id, tax_type, period, amount, status, description) VALUES (%s, '__payment__', %s, %s, 'paid', %s) RETURNING id",
                (user_id, purpose, amount, f'Плательщик: {card_holder}')
            )
            payment_id = cur.fetchone()[0]
            # Если платёж по конкретной записи — обновляем статус
            if record_id:
                cur.execute("UPDATE tax_records SET status='paid', updated_at=now() WHERE id=%s AND user_id=%s", (record_id, user_id))
            conn.commit()
            conn.close()
            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'success': True, 'payment_id': payment_id})}

        conn.close()
        return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'Неизвестный action'})}

    conn.close()
    return {'statusCode': 405, 'headers': CORS, 'body': json.dumps({'error': 'Method not allowed'})}
