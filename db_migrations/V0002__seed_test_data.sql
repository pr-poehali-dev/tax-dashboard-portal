
INSERT INTO users (client_id, password_hash, full_name, inn)
SELECT 'TEST001', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Иванов Иван Иванович', '7707123456'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE client_id = 'TEST001');

INSERT INTO tax_records (user_id, tax_type, period, amount, status, due_date, description)
SELECT u.id, 'НДС', '2024 Q1', 125000.00, 'paid', '2024-04-25', 'Налог на добавленную стоимость за 1 квартал 2024'
FROM users u WHERE u.client_id = 'TEST001'
AND NOT EXISTS (SELECT 1 FROM tax_records WHERE user_id = u.id AND tax_type = 'НДС' AND period = '2024 Q1');

INSERT INTO tax_records (user_id, tax_type, period, amount, status, due_date, description)
SELECT u.id, 'Налог на прибыль', '2024 Q1', 87500.00, 'pending', '2025-04-28', 'Налог на прибыль организаций за 1 квартал 2024'
FROM users u WHERE u.client_id = 'TEST001'
AND NOT EXISTS (SELECT 1 FROM tax_records WHERE user_id = u.id AND tax_type = 'Налог на прибыль' AND period = '2024 Q1');

INSERT INTO tax_records (user_id, tax_type, period, amount, status, due_date, description)
SELECT u.id, 'Страховые взносы', 'Март 2024', 43200.00, 'paid', '2024-04-15', 'Страховые взносы за март 2024'
FROM users u WHERE u.client_id = 'TEST001'
AND NOT EXISTS (SELECT 1 FROM tax_records WHERE user_id = u.id AND tax_type = 'Страховые взносы' AND period = 'Март 2024');

INSERT INTO tax_history (user_id, operation_type, tax_type, amount, period, description)
SELECT u.id, 'Оплата', 'НДС', 125000.00, '2024 Q1', 'Произведена оплата НДС за 1 квартал 2024'
FROM users u WHERE u.client_id = 'TEST001'
AND NOT EXISTS (SELECT 1 FROM tax_history WHERE user_id = u.id AND operation_type = 'Оплата' AND tax_type = 'НДС' AND period = '2024 Q1');

INSERT INTO tax_history (user_id, operation_type, tax_type, amount, period, description)
SELECT u.id, 'Начисление', 'Налог на прибыль', 87500.00, '2024 Q1', 'Начислен налог на прибыль за 1 квартал 2024'
FROM users u WHERE u.client_id = 'TEST001'
AND NOT EXISTS (SELECT 1 FROM tax_history WHERE user_id = u.id AND operation_type = 'Начисление' AND tax_type = 'Налог на прибыль');

INSERT INTO tax_history (user_id, operation_type, tax_type, amount, period, description)
SELECT u.id, 'Оплата', 'Страховые взносы', 43200.00, 'Март 2024', 'Оплачены страховые взносы за март 2024'
FROM users u WHERE u.client_id = 'TEST001'
AND NOT EXISTS (SELECT 1 FROM tax_history WHERE user_id = u.id AND operation_type = 'Оплата' AND tax_type = 'Страховые взносы');

INSERT INTO tax_history (user_id, operation_type, tax_type, amount, period, description)
SELECT u.id, 'Изменение статуса', 'НДС', NULL, '2024 Q1', 'Статус изменён: ожидает оплаты → оплачен'
FROM users u WHERE u.client_id = 'TEST001'
AND NOT EXISTS (SELECT 1 FROM tax_history WHERE user_id = u.id AND operation_type = 'Изменение статуса' AND tax_type = 'НДС');

INSERT INTO tax_comments (tax_record_id, author, comment)
SELECT r.id, 'Администратор', 'Оплата подтверждена. Квитанция получена 25.04.2024.'
FROM tax_records r JOIN users u ON r.user_id = u.id
WHERE u.client_id = 'TEST001' AND r.tax_type = 'НДС' AND r.period = '2024 Q1'
AND NOT EXISTS (SELECT 1 FROM tax_comments WHERE tax_record_id = r.id);
