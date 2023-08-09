import config = require('config');
import bunyan = require('bunyan');
import type Logger from 'bunyan';

const streams: Record<string, unknown>[] = [
    {
        stream: process.stdout,
        level: config.get('logger.level') || 'debug'
    }, {
        stream: process.stderr,
        level: 'warn'
    },
];

if (config.get('logger.toFile')) {
    streams.push({
        level: config.get('logger.level') || 'debug',
        path: config.get('logger.dirLogFile')
    });
}

const logger: Logger = bunyan.createLogger({
    name: config.get('logger.name'),
    src: true,
    streams,
});

export default logger;
