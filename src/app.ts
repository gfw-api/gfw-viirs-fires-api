import Koa from 'koa';
import Application from 'koa';
import config from 'config'
import logger from 'logger';
import koaLogger from 'koa-logger';
import { RWAPIMicroservice } from 'rw-api-microservice-node';
import koaBody from 'koa-body';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import koaValidate from 'koa-validate';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import koaSimpleHealthCheck from 'koa-simple-healthcheck';
import routerV2 from 'routes/firesv2.router';
import routerV1 from 'routes/firesv1.router';
import koaCash from 'koa-cash';
import { LRUCache } from 'lru-cache';
import { Server } from "http";
import process from "process";
import ErrorSerializer from 'serializers/error.serializer';

interface IInit {
    server: Server;
    app: Koa;
}

const init: () => Promise<IInit> = async (): Promise<IInit> => {
    return new Promise((resolve: (value: IInit | PromiseLike<IInit>) => void
    ) => {

        const app: Koa = new Koa();

        app.use(koaSimpleHealthCheck());

        app.use(koaLogger());

        app.use(koaBody({
            multipart: true, jsonLimit: '50mb', formLimit: '50mb', textLimit: '50mb'
        }));

        // catch errors and send in jsonapi standard. Always return vnd.api+json
        app.use(async (ctx: { status: number; response: { type: string; }; body: any; }, next: () => any) => {
            try {
                await next();
            } catch (error) {
                ctx.status = error.status || 500;

                if (ctx.status >= 500) {
                    logger.error(error);
                } else {
                    logger.info(error);
                }

                if (process.env.NODE_ENV === 'prod' && ctx.status === 500) {
                    ctx.response.type = 'application/vnd.api+json';
                    ctx.body = ErrorSerializer.serializeError(ctx.status, 'Unexpected error');
                    return;
                }

                ctx.response.type = 'application/vnd.api+json';
                ctx.body = ErrorSerializer.serializeError(ctx.status, error.message);
            }
        });

        const cache: LRUCache<string, unknown, unknown> = new LRUCache<string, unknown, unknown>({
            ttl: 30000,
            ttlAutopurge: true
        });


        app.use(koaCash({
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            get: (key: string): unknown => {
                logger.debug('Getting the cache key: %s', key);
                return cache.get(key);
            },
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            set: (key: string, value: unknown): void => {
                logger.debug('Setting in cache. key: %s, value: ', key, value);
                cache.set(key, value);
            },
            hash: (ctx: Application.Context) => ctx.request.originalUrl
        }));

        koaValidate(app);

        app.use(RWAPIMicroservice.bootstrap({
            logger,
            gatewayURL: process.env.GATEWAY_URL,
            microserviceToken: process.env.MICROSERVICE_TOKEN,
            fastlyEnabled: process.env.FASTLY_ENABLED as boolean | 'true' | 'false',
            fastlyServiceId: process.env.FASTLY_SERVICEID,
            fastlyAPIKey: process.env.FASTLY_APIKEY,
            requireAPIKey: process.env.REQUIRE_API_KEY as boolean | 'true' | 'false' || true,
            awsCloudWatchLoggingEnabled: process.env.AWS_CLOUD_WATCH_LOGGING_ENABLED as boolean | 'true' | 'false' || true,
            awsRegion: process.env.AWS_REGION,
            awsCloudWatchLogStreamName: config.get('service.name'),
        }));

        // load routes
        app.use(routerV1.middleware());
        app.use(routerV2.middleware());

        const port: string = config.get('service.port') || '9000';

        const server: Server = app.listen(port, () => {
            logger.info(`Server started in port:${port}`);
        });

        resolve({ app, server });

    });
};


export { init };
