const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const xss = require('xss-clean');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/authRoutes');
const houseRoutes = require('./routes/houseRoutes');
const locationRoutes = require('./routes/locationRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const agreementRoutes = require('./routes/agreementRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors());
app.use(xss());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
});
app.use('/api', limiter);

// Logging
app.use(morgan('combined'));

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/houses', houseRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/agreements', agreementRoutes);

// Health check
app.get('/health', (req, res) => res.status(200).json({ status: 'OK' }));
// Simple root route – kuondoa 404 kwenye browser
app.get('/', (req, res) => {
  res.json({ 
    message: 'Serkapp API is running', 
    version: '1.0',
    endpoints: {
      health: '/health',
      auth: '/api/auth',
      houses: '/api/houses',
      locations: '/api/locations',
      payments: '/api/payments',
      agreements: '/api/agreements'
    }
  });
});

// Error handling (last)
app.use(errorHandler);

module.exports = app;