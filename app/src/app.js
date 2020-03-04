const config = require('config');
const logger = require('logger');
const path = require('path');
const koa = require('koa');
const bodyParser = require('koa-bodyparser');
const koaLogger = require('koa-logger');
const loader = require('loader');
const validate = require('koa-validate');
const ErrorSerializer = require('serializers/errorSerializer');

// instance of koa
const app = koa();

// if environment is dev then load koa-logger
if (process.env.NODE_ENV === 'dev') {
    app.use(koaLogger());
}

app.use(bodyParser({
    jsonLimit: '50mb'
}));

// catch errors and send in jsonapi standard. Always return vnd.api+json
app.use(function* errorHandler(next) {
    try {
        yield next;
    } catch (err) {
        this.status = err.status || 500;
        logger.error(err);
        this.body = ErrorSerializer.serializeError(this.status, err.message);
        if (process.env.NODE_ENV === 'prod' && this.status === 500) {
            this.body = 'Unexpected error';
        }
    }
    this.response.type = 'application/vnd.api+json';
});

const cache = require('lru-cache')({
    maxAge: 30000 // global max age
});

app.use(require('koa-cash')({
    get(key) {
        logger.debug('Getting the cache key: %s', key);
        return cache.get(key);
    },
    set(key, value) {
        logger.debug('Setting in cache. key: %s, value: ', key, value);
        cache.set(key, value);
    }
}));

// load custom validator
app.use(validate());

// load routes
loader.loadRoutes(app);

// Instance of http module
const server = require('http').Server(app.callback());

// get port of environment, if not exist obtain of the config.
// In production environment, the port must be declared in environment variable
const port = process.env.PORT || config.get('service.port');

server.listen(port, () => {
    const microserviceClient = require('vizz.microservice-client');

    microserviceClient.register({
        id: config.get('service.id'),
        name: config.get('service.name'),
        dirConfig: path.join(__dirname, '../microservice'),
        dirPackage: path.join(__dirname, '../../'),
        logger,
        app
    });
    if (process.env.CT_REGISTER_MODE && process.env.CT_REGISTER_MODE === 'auto') {
        logger.info('Autoregistering');
        microserviceClient.autoDiscovery(config.get('service.name')).then(() => logger.info('Registered'), (err) => logger.error('Error registering', err));
    }
});

logger.info(`Server started in port:${port}`);
