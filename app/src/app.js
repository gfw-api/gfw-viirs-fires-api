const config = require('config');
const logger = require('logger');
const Koa = require('koa');
const koaBody = require('koa-body');
const koaLogger = require('koa-logger');
const loader = require('loader');
const koaValidate = require('koa-validate');
const koaSimpleHealthCheck = require('koa-simple-healthcheck');
const ErrorSerializer = require('serializers/errorSerializer');
const ctRegisterMicroservice = require('ct-register-microservice-node');
const koaCash = require('koa-cash');

const app = new Koa();

// if environment is dev then load koa-logger
if (process.env.NODE_ENV === 'dev') {
    app.use(koaLogger());
}

app.use(koaBody({
    multipart: true,
    jsonLimit: '50mb',
    formLimit: '50mb',
    textLimit: '50mb'
}));

// catch errors and send in jsonapi standard. Always return vnd.api+json
app.use(async (ctx, next) => {
    try {
        await next();
    } catch (inErr) {
        let error = inErr;
        try {
            error = JSON.parse(inErr);
        } catch (e) {
            logger.debug('Could not parse error message - is it JSON?: ', inErr);
            error = inErr;
        }
        ctx.status = error.status || ctx.status || 500;
        if (ctx.status >= 500) {
            logger.error(error);
        } else {
            logger.info(error);
        }

        ctx.body = ErrorSerializer.serializeError(ctx.status, error.message);
        if (process.env.NODE_ENV === 'prod' && ctx.status === 500) {
            ctx.body = 'Unexpected error';
        }
        ctx.response.type = 'application/vnd.api+json';
    }
});


const cache = require('lru-cache')({
    maxAge: 30000 // global max age
});

app.use(koaSimpleHealthCheck());

app.use(koaCash({
    get: (key) => {
        logger.debug('Getting the cache key: %s', key);
        return cache.get(key);
    },
    set: (key, value) => {
        logger.debug('Setting in cache. key: %s, value: ', key, value);
        cache.set(key, value);
    },
    hash: (ctx) => ctx.request.originalUrl
}));

koaValidate(app);

// load routes
loader.loadRoutes(app);

const port = process.env.PORT || config.get('service.port');

const server = app.listen(port, () => {
    ctRegisterMicroservice.register({
        name: config.get('service.name'),
        info: require('../microservice/register.json'),
        swagger: require('../microservice/public-swagger.json'),
        mode: (process.env.CT_REGISTER_MODE && process.env.CT_REGISTER_MODE === 'auto') ? ctRegisterMicroservice.MODE_AUTOREGISTER : ctRegisterMicroservice.MODE_NORMAL,
        framework: ctRegisterMicroservice.KOA2,
        app,
        logger,
        ctUrl: process.env.CT_URL,
        url: process.env.LOCAL_URL,
        token: process.env.CT_TOKEN,
        active: true
    });
});

logger.info('Server started in ', process.env.PORT);

module.exports = server;
