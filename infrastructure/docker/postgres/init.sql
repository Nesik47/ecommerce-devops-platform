-- Create products table
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL CHECK (price > 0),
    category VARCHAR(100) NOT NULL,
    stock INTEGER DEFAULT 0 CHECK (stock >= 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create users table (for future user service)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create orders table (for future orders service)
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    total_amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create order_items table
CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id),
    product_id INTEGER REFERENCES products(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    price_at_time DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert sample products
INSERT INTO products (name, description, price, category, stock) VALUES
('Gaming Laptop Pro', 'High-performance gaming laptop with RTX 4070 graphics card', 1299.99, 'Electronics', 15),
('Wireless Headphones', 'Premium noise-cancelling wireless headphones with 30h battery', 249.99, 'Audio', 30),
('Smart Watch Ultra', 'Advanced fitness tracking smartwatch with heart rate and GPS', 399.99, 'Wearables', 25),
('Mechanical Keyboard', 'RGB backlit mechanical keyboard with Cherry MX switches', 129.99, 'Accessories', 40),
('4K Webcam', 'Ultra HD webcam with auto-focus and noise reduction', 89.99, 'Electronics', 20),
('Bluetooth Speaker', 'Portable waterproof Bluetooth speaker with 360° sound', 79.99, 'Audio', 35),
('USB-C Hub', '7-in-1 USB-C hub with HDMI, USB ports and SD card reader', 49.99, 'Accessories', 50),
('Wireless Mouse', 'Ergonomic wireless mouse with precision tracking', 39.99, 'Accessories', 45);

-- Insert sample user (password is 'password123' hashed)
INSERT INTO users (username, email, password_hash, first_name, last_name) VALUES
('admin', 'admin@ecommerce.com', '$2b$10$rQZ8Q7XKzQ4rQZ8Q7XKzQ4rQZ8Q7XKzQ4rQZ8Q7XKzQ4rQZ8Q7XKz', 'Admin', 'User'),
('john_doe', 'john@example.com', '$2b$10$rQZ8Q7XKzQ4rQZ8Q7XKzQ4rQZ8Q7XKzQ4rQZ8Q7XKzQ4rQZ8Q7XKz', 'John', 'Doe');

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_price ON products(price);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- Create a view for product statistics
CREATE OR REPLACE VIEW product_stats AS
SELECT 
    category,
    COUNT(*) as total_products,
    AVG(price) as avg_price,
    SUM(stock) as total_stock,
    MIN(price) as min_price,
    MAX(price) as max_price
FROM products 
GROUP BY category;