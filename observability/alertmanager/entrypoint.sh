#!/bin/sh
# Alertmanager does not expand environment variables in its config file, so the SMTP
# settings are injected into the template here before Alertmanager starts.
set -eu

SMTP_HOST="${SMTP_HOST:-}"
SMTP_PORT="${SMTP_PORT:-}"
SMTP_FROM="${SMTP_FROM:-}"
SMTP_USER="${SMTP_USER:-}"
SMTP_PASSWORD="${SMTP_PASSWORD:-}"
SMTP_REQUIRE_TLS="${SMTP_REQUIRE_TLS:-}"
ALERT_EMAIL_TO="${ALERT_EMAIL_TO:-}"
GRAFANA_URL="${GRAFANA_URL:-http://34.171.152.81:3030}"

# the password goes through a file so special characters never touch the YAML

printf '%s' "$SMTP_PASSWORD" > /tmp/smtp_password

sed \
  -e "s#__SMTP_HOST__#${SMTP_HOST}#g" \
  -e "s#__SMTP_PORT__#${SMTP_PORT}#g" \
  -e "s#__SMTP_FROM__#${SMTP_FROM}#g" \
  -e "s#__SMTP_USER__#${SMTP_USER}#g" \
  -e "s#__SMTP_REQUIRE_TLS__#${SMTP_REQUIRE_TLS}#g" \
  -e "s#__ALERT_EMAIL_TO__#${ALERT_EMAIL_TO}#g" \
  -e "s#__GRAFANA_URL__#${GRAFANA_URL}#g" \
  /etc/alertmanager/alertmanager.yml.tmpl > /tmp/alertmanager.yml

exec /bin/alertmanager \
  --config.file=/tmp/alertmanager.yml \
  --storage.path=/alertmanager \
  --web.external-url="${ALERTMANAGER_URL:-http://34.171.152.81:9093}"
