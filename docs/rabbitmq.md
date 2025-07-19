# RabbitMQ Guide
*Last updated: 2025-06-25*

This document explains how to enable and use RabbitMQ in **Cicero_V2**. RabbitMQ processes heavy jobs asynchronously so the dashboard remains responsive.

## 1. Configuration

1. Ensure RabbitMQ is installed and running.
2. Set the connection URL in the `AMQP_URL` environment variable in `.env` (e.g. `amqp://localhost`).

## 2. Helper Functions

The project may include helper functions such as:

- `initRabbitMQ()` – create the connection and channel.
- `publishToQueue(queue, msg)` – send a JSON message to the queue.
- `consumeQueue(queue, onMessage)` – consume messages from the queue and execute a callback.

## 3. Tips

- Run the worker in a separate process using PM2 or another supervisor.
- Monitor the queue and RabbitMQ connection regularly to avoid bottlenecks.

---
See the README section *High Volume Queue (RabbitMQ)* for a short overview.
