import winston from 'winston';

export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize({ all: true }),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
          // Format the base message
          let log = `${timestamp} [${level}] ${message}`;
          
          // Add metadata if present (excluding empty objects)
          const metaKeys = Object.keys(meta);
          if (metaKeys.length > 0) {
            const metaStr = JSON.stringify(meta, null, 2);
            if (metaStr !== '{}') {
              log += `\n📊 Meta: ${metaStr}`;
            }
          }
          
          // Add stack trace for errors
          if (stack) {
            log += `\n🔥 Stack: ${stack}`;
          }
          
          return log;
        })
      )
    })
  ]
});