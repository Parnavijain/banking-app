// Shared Kafka wiring. Both the API and the worker services import from here
// so topic names, producer settings, and the DLQ pattern don't drift.

const { Kafka, logLevel } = require('kafkajs');
const { randomUUID } = require('crypto');

// --- Topic names ------------------------------------------------------------
// One place. If we rename, every service updates by pulling the new version.
const TOPICS = {
  TRANSACTION_INITIATED:  'transaction-initiated',
  TRANSACTION_COMPLETED:  'transaction-completed',
  USER_ACTIVITY:          'user-activity',
  // Dead letter queue: when a consumer permanently fails to process a
  // message, it's rerouted here instead of poisoning the consumer group.
  DLQ:                    'dlq',
};

// --- Client factory ---------------------------------------------------------
function createKafka(clientId) {
  return new Kafka({
    clientId,
    brokers: (process.env.KAFKA_BROKERS || 'localhost:19092').split(','),
    logLevel: logLevel.WARN,
    retry: { retries: 8, initialRetryTime: 300 },
  });
}

// --- Producer with a helpful publish() wrapper ------------------------------
async function createProducer(clientId) {
  const kafka = createKafka(clientId);
  // idempotent=true tells the broker to dedupe if we retry an already-sent
  // message. Doesn't give end-to-end idempotency (that's the app's job with
  // idempotency_key), but prevents accidental double-publishes on network hiccups.
  const producer = kafka.producer({ idempotent: true, maxInFlightRequests: 5 });
  await producer.connect();

  async function publish(topic, event) {
    // Every event gets an id + timestamp. Consumers use event.id to dedupe.
    const enriched = {
      id:         event.id || randomUUID(),
      occurredAt: event.occurredAt || new Date().toISOString(),
      ...event,
    };
    await producer.send({
      topic,
      messages: [{
        // Key controls partitioning. Using userId means all events for a user
        // land on the same partition → strict ordering per user.
        key:   event.partitionKey || String(enriched.id),
        value: JSON.stringify(enriched),
      }],
    });
    return enriched;
  }

  return { producer, publish };
}

// --- Consumer runner with retry + DLQ ---------------------------------------
// Wraps kafkajs's eachMessage in a retry loop. If a message keeps failing,
// it's forwarded to the DLQ topic and the consumer moves on. Without this,
// one bad message stalls the whole consumer group forever.
async function runConsumer({
  clientId,
  groupId,
  topics,
  handler,       // async ({ topic, event, raw }) => void
  maxRetries = 3,
  onDlq,         // optional — called when a message is DLQ'd
}) {
  const kafka = createKafka(clientId);
  const consumer = kafka.consumer({ groupId });
  const dlqProducer = kafka.producer();
  await consumer.connect();
  await dlqProducer.connect();
  await consumer.subscribe({ topics, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      let event;
      try {
        event = JSON.parse(message.value.toString());
      } catch (e) {
        console.error(`[${clientId}] malformed JSON, sending to DLQ`, e.message);
        await sendToDlq(dlqProducer, topic, message, 'malformed_json', e.message);
        return;
      }

      let lastErr;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          await handler({ topic, event, raw: message });
          return;                 // success!
        } catch (err) {
          lastErr = err;
          console.warn(
            `[${clientId}] attempt ${attempt}/${maxRetries} failed on ${topic}:`, err.message
          );
          // Simple exponential backoff between attempts.
          await new Promise((r) => setTimeout(r, 200 * 2 ** (attempt - 1)));
        }
      }
      console.error(`[${clientId}] giving up on message, sending to DLQ`);
      await sendToDlq(dlqProducer, topic, message, 'max_retries_exceeded', lastErr?.message);
      onDlq?.({ topic, event, error: lastErr });
    },
  });

  return { consumer, dlqProducer };
}

async function sendToDlq(producer, originalTopic, message, reason, errorMessage) {
  await producer.send({
    topic: TOPICS.DLQ,
    messages: [{
      key: message.key,
      value: JSON.stringify({
        originalTopic,
        originalKey:   message.key?.toString(),
        originalValue: message.value?.toString(),
        reason,
        errorMessage,
        failedAt: new Date().toISOString(),
      }),
    }],
  });
}

module.exports = { TOPICS, createKafka, createProducer, runConsumer };
