const http = require('http');
const url = require('url');

// Sample products data
const products = [
  {
    id: 1,
    name: "Gaming Laptop Pro",
    description: "High-performance gaming laptop with RTX graphics",
    price: 1299.99,
    category: "Electronics",
    stock: 15,
    createdAt: new Date().toISOString()
  },
  {
    id: 2,
    name: "Wireless Headphones",
    description: "Premium noise-cancelling wireless headphones",
    price: 249.99,
    category: "Audio",
    stock: 30,
    createdAt: new Date().toISOString()
  },
  {
    id: 3,
    name: "Smart Watch",
    description: "Fitness tracking smartwatch with heart rate monitor",
    price: 199.99,
    category: "Wearables",
    stock: 25,
    createdAt: new Date().toISOString()
  }
];

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

// Create HTTP server
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const method = req.method;
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query;

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  // Handle preflight OPTIONS request
  if (method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Health check endpoint
  if (pathname === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({
      status: 'OK',
      service: 'product-service',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    }));
    return;
  }

  // Products API routes
  if (pathname === '/api/products' && method === 'GET') {
    // Filter products based on query parameters
    let filteredProducts = [...products];
    
    if (query.category) {
      filteredProducts = filteredProducts.filter(
        product => product.category.toLowerCase().includes(query.category.toLowerCase())
      );
    }
    
    if (query.minPrice) {
      filteredProducts = filteredProducts.filter(
        product => product.price >= parseFloat(query.minPrice)
      );
    }
    
    if (query.maxPrice) {
      filteredProducts = filteredProducts.filter(
        product => product.price <= parseFloat(query.maxPrice)
      );
    }

    res.writeHead(200);
    res.end(JSON.stringify({
      success: true,
      count: filteredProducts.length,
      data: filteredProducts
    }));
    return;
  }

  // Get single product
  const productIdMatch = pathname.match(/^\/api\/products\/(\d+)$/);
  if (productIdMatch && method === 'GET') {
    const id = parseInt(productIdMatch[1]);
    const product = products.find(p => p.id === id);

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
    parseBody(req, (err, body) => {
      if (err) {
        res.writeHead(400);
        res.end(JSON.stringify({
          success: false,
          error: 'Invalid JSON'
        }));
        return;
      }

      const { name, description, price, category, stock } = body;

      if (!name || !price || !category) {
        res.writeHead(400);
        res.end(JSON.stringify({
          success: false,
          error: 'Name, price, and category are required'
        }));
        return;
      }

      const newProduct = {
        id: Math.max(...products.map(p => p.id)) + 1,
        name,
        description: description || '',
        price: parseFloat(price),
        category,
        stock: parseInt(stock) || 0,
        createdAt: new Date().toISOString()
      };

      products.push(newProduct);

      res.writeHead(201);
      res.end(JSON.stringify({
        success: true,
        data: newProduct
      }));
    });
    return;
  }

  // 404 for all other routes
  res.writeHead(404);
  res.end(JSON.stringify({
    error: 'Route not found',
    path: pathname,
    method: method
  }));
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`🚀 Product Service running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`📋 API Base URL: http://localhost:${PORT}/api/products`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received. Starting graceful shutdown...');
  server.close(() => {
    console.log('✅ Server closed successfully');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received. Starting graceful shutdown...');
  server.close(() => {
    console.log('✅ Server closed successfully');
    process.exit(0);
  });
});