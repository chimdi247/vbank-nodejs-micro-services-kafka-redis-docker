#!/bin/bash
# Builds and starts everything: backend services, frontend, Kafka/Redis UIs and the observability stack.
docker compose up -d --build
