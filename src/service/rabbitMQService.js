import amqp from 'amqplib';
import { env } from '../config/env.js';

let connection = null;
let channel = null;

export async function initRabbitMQ() {
  if (connection && channel) return { connection, channel };
  connection = await amqp.connect(env.AMQP_URL);
  channel = await connection.createChannel();
  return { connection, channel };
}

export async function publishToQueue(queue, msg) {
  if (!channel) await initRabbitMQ();
  await channel.assertQueue(queue, { durable: true });
  return channel.sendToQueue(queue, Buffer.from(JSON.stringify(msg)), {
    persistent: true
  });
}

export async function consumeQueue(queue, onMessage) {
  if (!channel) await initRabbitMQ();
  await channel.assertQueue(queue, { durable: true });
  channel.consume(queue, async (msg) => {
    if (msg === null) return;
    try {
      const data = JSON.parse(msg.content.toString());
      await onMessage(data);
      channel.ack(msg);
    } catch (err) {
      console.error('[RabbitMQ] consumer error', err);
      channel.nack(msg, false, false);
    }
  });
}

