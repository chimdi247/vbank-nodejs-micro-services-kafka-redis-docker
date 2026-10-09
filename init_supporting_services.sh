#!/bin/bash
# Starts only the infrastructure (for running the Node services locally with `npm run dev`).
docker compose up -d postgres redis kafka kafka-init kafka-ui redis-ui
