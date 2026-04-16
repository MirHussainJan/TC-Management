import { createLogger, transports, format, Logform } from 'winston';
import DailyRotateFile = require('winston-daily-rotate-file');

class Logger {
  static log(message: string) {
    const logger = createLogger({
      transports : [
        new DailyRotateFile({
          dirname      : 'logs',
          filename     : 'tc-%DATE%.log',
          datePattern  : 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize      : '20m',
          maxFiles     : '60d',
        }),
      ],
      format     : format.combine(
        format.timestamp(),
        format.printf(({ level, message }) => {
          return `[${new Date().toISOString()}] ${level}: ${message}`;
        }),
      ) as Logform.Format,
      defaultMeta: {
        service: 'monday-tc-log',
      },
    });

    logger.info(message);
  }
}

export default Logger;


// import { createLogger, transports, format } from "winston";
// import DailyRotateFile = require("winston-daily-rotate-file");
// class Logger {
//   static log(message) {
//     const logger = createLogger({
//       transports: [
//         new DailyRotateFile({
//           dirname: 'logs',
//           filename: 'tc-%DATE%.log',
//           datePattern: 'YYYY-MM-DD',
//           zippedArchive: true,
//           maxSize: '20m',
//           maxFiles: '14d'
//         })
//       ],
//       format: format.combine(
//         format.timestamp(),
//         format.printf(({ timestamp, level, message, service }) => {
//           return `[${timestamp}] ${service} ${level}: ${message}`;
//         }),
//       ),
//       defaultMeta: {
//         service: 'monday-tc-log',
//       },
//     });

//     logger.info(message);
//   }
// }

// export default Logger;
