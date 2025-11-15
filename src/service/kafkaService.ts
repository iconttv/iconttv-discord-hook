import { Kafka, logLevel, Partitioners, Producer } from 'kafkajs';
import { config } from '../config';
import { LogContext } from '../utils/discord';
import logger from '../lib/logger';

let _kafkaClient: Kafka | undefined = undefined;
let _kafkaProducer: Producer | undefined = undefined;

export const getKafkaClient = () => {
  if (_kafkaClient) {
    return _kafkaClient;
  }
  if (!config.KAFKA_ENABLE || !config.KAFKA_REST_PROXY) {
    return undefined;
  }

  _kafkaClient = new Kafka({
    clientId: config.KAFKA_CLIENT_ID ?? 'iconttv',
    brokers: async () => {
      // Example getting brokers from Confluent REST Proxy
      const clusterResponse = await fetch(
        `${config.KAFKA_REST_PROXY}/v3/clusters`,
        {
          headers: { 'Content-Type': 'application/vnd.api+json' },
        }
      ).then(response => response.json());

      const brokersUrl = clusterResponse.data[0].brokers.related;
      const brokersResponse = await fetch(brokersUrl, {
        headers: { 'Content-Type': 'application/vnd.api+json' },
      }).then(response => response.json());

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const brokers = brokersResponse.data.map((broker: any) => {
        const { host, port, broker_id } = broker;
        logger.info(`broker ${broker_id} ${host}:${port}`);

        return `${host}:${port}`;
      });

      return brokers;
    },
    logLevel: logLevel.INFO,
  });

  logger.info('Kafka client created!');
  return _kafkaClient;
};

export const getKafkaProducer = async () => {
  if (_kafkaProducer) {
    return _kafkaProducer;
  }

  const client = getKafkaClient();
  if (!client) {
    return;
  }

  _kafkaProducer = client.producer({
    createPartitioner: Partitioners.DefaultPartitioner,
    allowAutoTopicCreation: true,
  });
  await _kafkaProducer.connect();
  logger.info('Kafka producer connected!');

  return _kafkaProducer;
};

export const produceMessageToKafka = async (context: LogContext) => {
  try {
    const kafkaProducer = await getKafkaProducer();
    if (kafkaProducer) {
      await kafkaProducer.send({
        topic: config.KAFKA_TOPIC ?? 'iconttv-message',
        messages: [
          {
            key: `${context.guildId}_${context.channelId}`,
            value: context.senderMessage,
            headers: {
              'guild-id': context.guildId,
              'channel-id': context.channelId,
              'message-id': context.messageId,
              'sender-id': context.senderId,
              'thread-id': context.threadId ?? '',
            },
            timestamp: context.createdAt.getTime().toString(),
          },
        ],
      });
    }
  } catch (e) {
    logger.error(`failed to publish message. ${e}`);
  }
};
