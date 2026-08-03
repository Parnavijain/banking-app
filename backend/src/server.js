require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');

const authRoutes = require('./routes/authRoutes');
const accountRoutes = require('./routes/accountRoutes');
const transferRoutes = require('./routes/transferRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const scheduleRoutes = require('./routes/scheduleRoutes');
const statementRoutes = require('./routes/statementRoutes');
const adminRoutes = require('./routes/adminRoutes');
const internalRoutes = require('./routes/internalRoutes');
const { errorHandler } = require('./middleware/errorHandler');
const { initSocket } = require('./config/socket');
const { initProducer, shutdown: shutdownKafka } = require('./config/kafka');

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api', accountRoutes);
app.use('/api', transferRoutes);
app.use('/api', analyticsRoutes);
app.use('/api', scheduleRoutes);
app.use('/api', statementRoutes);
app.use('/api', adminRoutes);
app.use('/internal', internalRoutes);

// 404
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler (must be last)
app.use(errorHandler);

const server = http.createServer(app);
initSocket(server);

const PORT = process.env.PORT || 4000;

// Bring up Kafka before we start accepting requests.
initProducer()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`🏦 Banking API listening on http://localhost:${PORT}`);
      console.log(`📡 Socket.io ready on the same port`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize Kafka producer:', err);
    process.exit(1);
  });

// Clean shutdown so Kafka doesn't leave zombie sessions.
async function gracefulShutdown() {
  console.log('Shutting down…');
  await shutdownKafka();
  process.exit(0);
}
process.on('SIGINT',  gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
