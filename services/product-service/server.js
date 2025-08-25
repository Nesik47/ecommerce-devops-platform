const http = require('http');
const url = require('url');
const { Pool } = require('pg');

// PostgreSQL connection pool
const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'ecommerce',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres123',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

// Helper function to parse JSON body
function parseBody(req, callback) {
  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });
  req.on('end', () => {
    try {
      const parsed = body ? JSON.parse(body) : {};
      callback(null, parsed);
    } catch (err) {
      callback(err, null);
    }
  });
}

// Database service functions
class ProductService {
  static async getAllProducts(filters = {}) {
    let sql = `
      SELECT id, name, description, price, category, stock, 
             created_at, updated_at 
      FROM products 
      WHERE 1=1
    `;
    const params = [];

    // Add filters
    if (filters.category) {
      sql += ` AND LOWER(category) LIKE LOWER($${params.length + 1})`;
      params.push(`%${filters.category}%`);
    }
    
    if (filters.minPrice) {
      sql += ` AND price >= $${params.length + 1}`;
      params.push(parseFloat(filters.minPrice));
    }
    
    if (filters.maxPrice) {
      sql += ` AND price <= $${params.length + 1}`;
      params.push(parseFloat(filters.maxPrice));
    }

    sql += ` ORDER BY created_at DESC`;

    try {
      const result = await pool.query(sql, params);
      return result.rows;
    } catch (error) {
      console.error('Database query error:', error);
      throw new Error('Failed to fetch products');
    }
  }

  static async getProductById(id) {
    const sql = `
      SELECT id, name, description, price, category, stock, 
             created_at, updated_at 
      FROM products 
      WHERE id = $1
    `;
    
    try {
      const result = await pool.query(sql, [id]);
      return result.rows[0] || null;
    } catch (error) {
      console.error('Database query error:', error);
      throw new Error('Failed to fetch product');
    }
  }

  static async createProduct(productData) {
    const { name, description, price, category, stock } = productData;
    
    const sql = `
      INSERT INTO products (name, description, price, category, stock, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id, name, description, price, category, stock, created_at, updated_at
    `;
    
    const params = [
      name, 
      description || '', 
      parseFloat(price), 
      category, 
      parseInt(stock) || 0
    ];

    try {
      const result = await pool.query(sql, params);
      return result.rows[0];
    } catch (error) {
      console.error('Database insert error:', error);
      if (error.code === '23505') { // Unique constraint violation
        throw new Error('Product with this name already exists');
      }
      throw new Error('Failed to create product');
    }
  }

  static async updateProduct(id, productData) {
    const { name, description, price, category, stock } = productData;
    
    // Build dynamic update query
    const updates = [];
    const params = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      params.push(name);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      params.push(description);
    }
    if (price !== undefined) {
      updates.push(`price = $${paramCount++}`);
      params.push(parseFloat(price));
    }
    if (category !== undefined) {
      updates.push(`category = $${paramCount++}`);
      params.push(category);
    }
    if (stock !== undefined) {
      updates.push(`stock = $${paramCount++}`);
      params.push(parseInt(stock));
    }

    if (updates.length === 0) {
      throw new Error('No fields to update');
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(id);

    const sql = `
      UPDATE products 
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, name, description, price, category, stock, created_at, updated_at
    `;

    try {
      const result = await pool.query(sql, params);
      return result.rows[0];
    } catch (error) {
      console.error('Database update error:', error);
      throw new Error('Failed to update product');
    }
  }

  static async deleteProduct(id) {
    const sql = `
      DELETE FROM products 
      WHERE id = $1 
      RETURNING id, name, description, price, category, stock, created_at, updated_at
    `;

    try {
      const result = await pool.query(sql, [id]);
      return result.rows[0];
    } catch (error) {
      console.error('Database delete error:', error);
      throw new Error('Failed to delete product');
    }
  }

  static async getProductStats() {
    const sql = `
      SELECT 
        category,
        COUNT(*) as total_products,
        AVG(price) as avg_price,
        SUM(stock) as total_stock,
        MIN(price) as min_price,
        MAX(price) as max_price
      FROM products 
      GROUP BY category
      ORDER BY total_products DESC
    `;

    try {
      const result = await pool.query(sql);
      return result.rows;
    } catch (error) {
      console.error('Database stats query error:', error);
      throw new Error('Failed to fetch product statistics');
    }
  }
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const method = req.method;
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query;

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  try {
    // Handle preflight OPTIONS request
    if (method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // Health check endpoint
    if (pathname === '/health') {
      let dbStatus = 'disconnected';
      let dbInfo = {};

      try {
        const client = await pool.connect();
        const result = await client.query('SELECT NOW() as server_time, version() as version');
        client.release();
        
        dbStatus = 'connected';
        dbInfo = {
          server_time: result.rows[0].server_time,
          version: result.rows[0].version.split(' ')[0] + ' ' + result.rows[0].version.split(' ')[1],
          pool_total: pool.totalCount,
          pool_idle: pool.idleCount,
          pool_waiting: pool.waitingCount
        };
      } catch (error) {
        console.error('Database health check failed:', error);
        dbInfo = { error: error.message };
      }

      res.writeHead(200);
      res.end(JSON.stringify({
        status: 'OK',
        service: 'product-service',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        database: {
          status: dbStatus,
          ...dbInfo
        },
        environment: process.env.NODE_ENV || 'development'
      }));
      return;
    }

    // Product statistics endpoint
    if (pathname === '/api/products/stats' && method === 'GET') {
      const stats = await ProductService.getProductStats();
      res.writeHead(200);
      res.end(JSON.stringify({
        success: true,
        data: stats
      }));
      return;
    }

    // Products API routes
    if (pathname === '/api/products' && method === 'GET') {
      const products = await ProductService.getAllProducts(query);
      res.writeHead(200);
      res.end(JSON.stringify({
        success: true,
        count: products.length,
        data: products
      }));
      return;
    }

    // Get single product
    const productIdMatch = pathname.match(/^\/api\/products\/(\d+)$/);
    if (productIdMatch && method === 'GET') {
      const id = parseInt(productIdMatch[1]);
      const product = await ProductService.getProductById(id);

      if (!product) {
        res.writeHead(404);
        res.end(JSON.stringify({
          success: false,
          error: 'Product not found'
        }));
        return;
      }

      res.writeHead(200);
      res.end(JSON.stringify({
        success: true,
        data: product
      }));
      return;
    }

    // Create new product
    if (pathname === '/api/products' && method === 'POST') {
      parseBody(req, async (err, body) => {
        if (err) {
          res.writeHead(400);
          res.end(JSON.stringify({
            success: false,
            error: 'Invalid JSON'
          }));
          return;
        }

        const { name, description, price, category, stock } = body;

        // Validation
        if (!name || !price || !category) {
          res.writeHead(400);
          res.end(JSON.stringify({
            success: false,
            error: 'Name, price, and category are required'
          }));
          return;
        }

        if (price <= 0) {
          res.writeHead(400);
          res.end(JSON.stringify({
            success: false,
            error: 'Price must be greater than 0'
          }));
          return;
        }

        try {
          const newProduct = await ProductService.createProduct(body);
          res.writeHead(201);
          res.end(JSON.stringify({
            success: true,
            data: newProduct
          }));
        } catch (error) {
          res.writeHead(400);
          res.end(JSON.stringify({
            success: false,
            error: error.message
          }));
        }
      });
      return;
    }

    // Update product
    if (productIdMatch && method === 'PUT') {
      const id = parseInt(productIdMatch[1]);
      
      parseBody(req, async (err, body) => {
        if (err) {
          res.writeHead(400);
          res.end(JSON.stringify({
            success: false,
            error: 'Invalid JSON'
          }));
          return;
        }

        // Validate price if provided
        if (body.price && body.price <= 0) {
          res.writeHead(400);
          res.end(JSON.stringify({
            success: false,
            error: 'Price must be greater than 0'
          }));
          return;
        }

        try {
          const updatedProduct = await ProductService.updateProduct(id, body);
          if (!updatedProduct) {
            res.writeHead(404);
            res.end(JSON.stringify({
              success: false,
              error: 'Product not found'
            }));
            return;
          }

          res.writeHead(200);
          res.end(JSON.stringify({
            success: true,
            data: updatedProduct
          }));
        } catch (error) {
          res.writeHead(400);
          res.end(JSON.stringify({
            success: false,
            error: error.message
          }));
        }
      });
      return;
    }

    // Delete product
    if (productIdMatch && method === 'DELETE') {
      const id = parseInt(productIdMatch[1]);
      
      try {
        const deletedProduct = await ProductService.deleteProduct(id);
        
        if (!deletedProduct) {
          res.writeHead(404);
          res.end(JSON.stringify({
            success: false,
            error: 'Product not found'
          }));
          return;
        }

        res.writeHead(200);
        res.end(JSON.stringify({
          success: true,
          message: 'Product deleted successfully',
          data: deletedProduct
        }));
      } catch (error) {
        res.writeHead(400);
        res.end(JSON.stringify({
          success: false,
          error: error.message
        }));
      }
      return;
    }

    // 404 for all other routes
    res.writeHead(404);
    res.end(JSON.stringify({
      error: 'Route not found',
      path: pathname,
      method: method
    }));

  } catch (error) {
    console.error('Server error:', error);
    res.writeHead(500);
    res.end(JSON.stringify({
      success: false,
      error: 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && { details: error.message })
    }));
  }
});

const PORT = process.env.PORT || 3001;

// Initialize database connection and start server
async function startServer() {
  console.log('🔧 Initializing Product Service with PostgreSQL...');
  
  // Test database connection
  try {
    const client = await pool.connect();
    console.log('✅ Database connection successful');
    
    // Test if products table exists
    const result = await client.query("SELECT COUNT(*) FROM products");
    console.log(`📊 Found ${result.rows[0].count} products in database`);
    
    client.release();
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.log('⚠️  Server will start anyway, but database operations will fail');
  }
  
  server.listen(PORT, () => {
    console.log(`🚀 Product Service running on port ${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🗄️  Database: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/health`);
    console.log(`📋 API Base URL: http://localhost:${PORT}/api/products`);
    console.log(`📈 Statistics: http://localhost:${PORT}/api/products/stats`);
  });
}

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
  
  server.close(async (err) => {
    if (err) {
      console.error('❌ Error during server shutdown:', err);
    } else {
      console.log('✅ Server closed successfully');
    }
    
    // Close database pool
    try {
      await pool.end();
      console.log('✅ Database pool closed successfully');
    } catch (error) {
      console.error('❌ Error closing database pool:', error);
    }
    
    process.exit(err ? 1 : 0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start the server
startServer().catch(error => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});