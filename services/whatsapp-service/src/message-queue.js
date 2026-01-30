/**
 * Message Queue
 * RabbitMQ client for async message processing
 */

import amqplib from 'amqplib';

export class MessageQueue {
  constructor() {
    this.connection = null;
    this.channel = null;
    this.exchange = 'aiyou.whatsapp';
  }

  async connect() {
    const url = process.env.RABBITMQ_URL || 'amqp://localhost';

    this.connection = await amqplib.connect(url);
    this.channel = await this.connection.createChannel();

    // Setup exchange
    await this.channel.assertExchange(this.exchange, 'topic', { durable: true });

    // Setup queues
    await this.setupQueues();

    console.log('✅ MessageQueue connected to RabbitMQ');

    // Handle connection errors
    this.connection.on('error', (err) => {
      console.error('RabbitMQ connection error:', err);
    });

    this.connection.on('close', () => {
      console.log('RabbitMQ connection closed');
      setTimeout(() => this.connect(), 5000);
    });
  }

  async setupQueues() {
    const queues = [
      { name: 'whatsapp.messages.received', routingKey: 'whatsapp.message.received' },
      { name: 'whatsapp.messages.status', routingKey: 'whatsapp.message.status' },
      { name: 'whatsapp.sessions.events', routingKey: 'whatsapp.session.*' },
    ];

    for (const q of queues) {
      await this.channel.assertQueue(q.name, { durable: true });
      await this.channel.bindQueue(q.name, this.exchange, q.routingKey);
    }
  }

  async publish(routingKey, message) {
    if (!this.channel) {
      throw new Error('Message queue not connected');
    }

    const content = Buffer.from(JSON.stringify(message));

    this.channel.publish(this.exchange, routingKey, content, {
      persistent: true,
      contentType: 'application/json',
      timestamp: Date.now(),
    });
  }

  async subscribe(queue, handler) {
    if (!this.channel) {
      throw new Error('Message queue not connected');
    }

    await this.channel.consume(queue, async (msg) => {
      if (!msg) return;

      try {
        const content = JSON.parse(msg.content.toString());
        await handler(content);
        this.channel.ack(msg);
      } catch (err) {
        console.error(`Error processing message from ${queue}:`, err);
        // Requeue on failure
        this.channel.nack(msg, false, true);
      }
    });
  }

  async close() {
    if (this.channel) {
      await this.channel.close();
    }
    if (this.connection) {
      await this.connection.close();
    }
  }
}
