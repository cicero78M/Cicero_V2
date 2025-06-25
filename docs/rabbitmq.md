# RabbitMQ Guide
*Last updated: 2026-04-01*

This document explains how to enable and use RabbitMQ in **Cicero_V2**. RabbitMQ processes heavy jobs asynchronously so the dashboard remains responsive.

## 1. Configuration

1. Ensure RabbitMQ is installed and running.
2. Set the connection URL in the `AMQP_URL` environment variable in `.env` (e.g. `amqp://localhost`).

## 2. Core Functions

`src/service/rabbitMQService.js` provides three main functions:

- `initRabbitMQ()` – create the connection and channel.
- `publishToQueue(queue, msg)` – send a JSON message to the queue.
- `consumeQueue(queue, onMessage)` – consume messages from the queue and execute a callback.

## 3. Sample Worker

```javascript
import { consumeQueue } from './src/service/rabbitMQService.js';

async function handle(data) {
  console.log('Received data:', data);
}

consumeQueue('jobs', handle);
```

The worker above takes messages from the `jobs` queue and processes them one by one.

## 4. Tips

- Run the worker in a separate process using PM2 or another supervisor.
- Monitor the queue and RabbitMQ connection regularly to avoid bottlenecks.

---
See the README section *High Volume Queue (RabbitMQ)* for a short overview.
