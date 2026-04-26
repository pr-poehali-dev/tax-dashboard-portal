
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  client_id VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  inn VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tax_records (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  tax_type VARCHAR(100) NOT NULL,
  period VARCHAR(50) NOT NULL,
  amount NUMERIC(15,2) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  due_date DATE,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tax_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  operation_type VARCHAR(100) NOT NULL,
  tax_type VARCHAR(100),
  amount NUMERIC(15,2),
  period VARCHAR(50),
  description TEXT NOT NULL,
  occurred_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tax_comments (
  id SERIAL PRIMARY KEY,
  tax_record_id INTEGER REFERENCES tax_records(id),
  author VARCHAR(100) DEFAULT 'Администратор',
  comment TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
