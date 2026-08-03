// Backend-side Kafka producer. One instance shared across the app.
const { createProducer, TOPICS } = require('@banking/kafka');

let producerHandle = null;

async function initProducer() {
  producerHandle = await createProducer('banking-api');
  console.log('📤 Kafka producer connected');
  return producerHandle;
}

async function publish(topic, event) {
  if (!producerHandle) throw new Error('Kafka producer not initialized');
  return producerHandle.publish(topic, event);
}

async function shutdown() {
  if (producerHandle) await producerHandle.producer.disconnect();
}

module.exports = { initProducer, publish, shutdown, TOPICS };
