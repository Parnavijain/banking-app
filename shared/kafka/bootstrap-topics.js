// Ensures our topics exist with proper partition counts.
// Idempotent — safe to run repeatedly. Run once before starting workers.
require('dotenv').config();
const { createKafka, TOPICS } = require('./index');

async function main() {
  const kafka = createKafka('topic-bootstrap');
  const admin = kafka.admin();
  await admin.connect();

  const topics = [
    { topic: TOPICS.TRANSACTION_INITIATED, numPartitions: 3, replicationFactor: 1 },
    { topic: TOPICS.TRANSACTION_COMPLETED, numPartitions: 3, replicationFactor: 1 },
    { topic: TOPICS.USER_ACTIVITY,         numPartitions: 3, replicationFactor: 1 },
    { topic: TOPICS.DLQ,                   numPartitions: 1, replicationFactor: 1 },
  ];

  const created = await admin.createTopics({ topics, waitForLeaders: true });
  console.log(created ? 'Topics created.' : 'Topics already existed.');
  console.log('Available topics:', await admin.listTopics());

  await admin.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
