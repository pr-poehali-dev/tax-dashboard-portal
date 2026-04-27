CREATE TABLE IF NOT EXISTS admin_notes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    color VARCHAR(20) DEFAULT 'yellow',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fines (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    tax_record_id INTEGER REFERENCES tax_records(id),
    reason VARCHAR(255) NOT NULL,
    amount NUMERIC(15,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'unpaid',
    due_date DATE,
    created_at TIMESTAMP DEFAULT NOW()
);