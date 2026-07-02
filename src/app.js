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
const commentRoutes = require('./routes/commentRoutes');

const app = express();

app.set('trust proxy', 1);

app.use(helmet());
app.use(cors());
app.use(xss());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
});
app.use('/api', limiter);

app.use(morgan('combined'));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/houses', houseRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/agreements', agreementRoutes);
app.use('/api/comments', commentRoutes);

app.get('/health', (req, res) => res.status(200).json({ status: 'OK' }));

app.get('/', (req, res) => {
  res.json({ 
    message: 'Serkapp API is running', 
    version: '1.1',
    endpoints: {
      health: '/health',
      auth: '/api/auth',
      houses: '/api/houses',
      'houses/feed/videos': '/api/houses/feed/videos',
      locations: '/api/locations',
      payments: '/api/payments',
      agreements: '/api/agreements'
    }
  });
});

app.use(errorHandler);

module.exports = app;