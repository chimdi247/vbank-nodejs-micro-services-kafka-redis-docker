#!/bin/sh
# One-shot job (service "kafka-init" in docker-compose.yml) that creates the topics
# the services use, then exits. Idempotent thanks to --if-not-exists.
set -e

BOOTSTRAP="${KAFKA_BOOTSTRAP:-kafka:9092}"
KT=/opt/kafka/bin/kafka-topics.sh

echo "Waiting for Kafka at ${BOOTSTRAP}..."
until $KT --bootstrap-server "$BOOTSTRAP" --list >/dev/null 2>&1; do
  sleep 2
done

for topic in user.registered account.created account.deleted transaction.events; do
  $KT --bootstrap-server "$BOOTSTRAP" --create --if-not-exists \
      --topic "$topic" --partitions 10 --replication-factor 1
done

echo "Topics ready:"
$KT --bootstrap-server "$BOOTSTRAP" --list
