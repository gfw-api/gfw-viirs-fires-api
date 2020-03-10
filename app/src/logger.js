const config = require('config');
const bunyan = require('bunyan');

const streams = [
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

const logger = bunyan.createLogger({
    name: config.get('logger.name'),
    src: true,
    streams,
});

module.exports = logger;
