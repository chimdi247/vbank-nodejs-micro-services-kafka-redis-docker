import winston from "winston";

export const getLogger = (service: string, level = "debug") => {
  return winston.createLogger({
    level: level,
    defaultMeta: { service },
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.printf((info) => {
        const { level, message, timestamp, service } = info;
        // trace_id / span_id are injected by @opentelemetry/instrumentation-winston
        // when a span is active, which lets you jump from a log line to its trace
        const trace = info.trace_id
          ? ` [trace_id=${info.trace_id} span_id=${info.span_id}]`
          : "";
        return `[${timestamp}] [${level}] [${service}]${trace}: ${message}`;
      })
    ),
    transports: [new winston.transports.Console()],
  });
};
