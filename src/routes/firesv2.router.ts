import Router from 'koa-router';
import logger from 'logger';
import { Context, Next } from 'koa';
import DatasetService from 'services/datasetService';
import ViirsFiresSerializerV2 from 'serializers/viirsFiresSerializerV2';

import NotFound from 'errors/notFound';

const routerV2: Router = new Router({
    prefix: '/api/v2/viirs-active-fires'
});

class ViirsV2FiresRouter {

    static async getAdm0(ctx: Context): Promise<void> {
        logger.info('Obtaining national data');
        const data: Record<string, any> = await DatasetService.getAdm(
            ctx.request.headers['x-api-key'] as string,
            ctx.params.iso as string,
            ctx.request.query.forSubscription as string,
            ctx.request.query.period as string,
            ctx.request.query.group === 'true'
        );
        logger.debug('obtained ', data);
        ctx.response.body = ViirsFiresSerializerV2.serialize(data);
    }

    static async getAdm1(ctx: Context): Promise<void> {
        logger.info('Obtaining subnational data');
        const data: Record<string, any> = await DatasetService.getAdm(
            ctx.request.headers['x-api-key'] as string,
            ctx.params.iso,
            ctx.request.query.forSubscription as string,
            ctx.request.query.period as string,
            ctx.request.query.group === 'true',
            ctx.params.id1 as string
        );
        ctx.response.body = ViirsFiresSerializerV2.serialize(data);
    }

    static async getAdm2(ctx: Context): Promise<void> {
        logger.info('Obtaining region data');
        const data: Record<string, any> = await DatasetService.getAdm(
            ctx.request.headers['x-api-key'] as string,
            ctx.params.iso as string,
            ctx.request.query.forSubscription as string,
            ctx.request.query.period as string,
            ctx.request.query.group === 'true',
            ctx.params.id1 as string,
            ctx.params.id2 as string
        );
        ctx.response.body = ViirsFiresSerializerV2.serialize(data);
    }

    static async use(ctx: Context): Promise<void> {
        logger.info('Obtaining use data with name %s and id %s', ctx.params.name, ctx.params.id);
        const data: Record<string, any> = await DatasetService.getUse(
            ctx.params.name as string,
            ctx.params.id as string,
            ctx.request.query.forSubscription as string,
            ctx.request.query.period as string,
            ctx.request.query.group === 'true',
            ctx.request.headers['x-api-key'] as string
        );
        ctx.response.body = ViirsFiresSerializerV2.serialize(data);

    }

    static async wdpa(ctx: Context): Promise<void> {
        logger.info('Obtaining wpda data with id %s', ctx.params.id);
        const data: Record<string, any> = await DatasetService.getWdpa(
            ctx.params.id as string,
            ctx.request.query.forSubscription as string,
            ctx.request.query.period as string,
            ctx.request.query.group === 'true',
            ctx.request.headers['x-api-key'] as string
        );
        ctx.response.body = ViirsFiresSerializerV2.serialize(data);
    }

    static async world(ctx: Context): Promise<void> {
        logger.info('Obtaining world data');
        try {
            const data: Record<string, any> = await DatasetService.getWorld(
                ctx.request.query.geostore as string,
                ctx.request.query.forSubscription as string,
                ctx.request.query.period as string,
                ctx.request.query.group === 'true',
                ctx.request.headers['x-api-key'] as string
            );

            ctx.response.body = ViirsFiresSerializerV2.serialize(data);
        } catch (err) {
            if (err instanceof NotFound) {
                ctx.throw(404, 'Geostore not found');
            }
            throw err;
        }
    }

    static checkGeojson(geojson: Record<string, any>): Record<string, any> {
        if (geojson.type.toLowerCase() === 'polygon') {
            return {
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    geometry: geojson
                }]
            };
        }
        if (geojson.type.toLowerCase() === 'feature') {
            return {
                type: 'FeatureCollection',
                features: [geojson]
            };
        }
        return geojson;
    }

    static async worldWithGeojson(ctx: Context): Promise<void> {
        logger.info('Obtaining world data with geostore');
        ctx.assert(ctx.request.body.geojson, 400, 'GeoJSON param required');
        try {
            const data: Record<string, any> = await DatasetService.getWorldWithGeojson(
                ViirsV2FiresRouter.checkGeojson(ctx.request.body.geojson),
                ctx.request.query.forSubscription as string,
                ctx.request.query.period as string,
                ctx.request.query.group === 'true',
                ctx.request.headers['x-api-key'] as string
            );

            ctx.response.body = ViirsFiresSerializerV2.serialize(data);
        } catch (err) {
            if (err instanceof NotFound) {
                ctx.throw(404, 'Geostore not found');
                return;
            }
            throw err;
        }

    }

    static async latest(ctx: Context): Promise<void> {
        logger.info('Obtaining latest data');
        const data: any = await DatasetService.latest(ctx.request.headers['x-api-key'] as string);
        ctx.response.body = ViirsFiresSerializerV2.serializeLatest(data);
    }

}

const isCached = async (ctx: Context, next: Next): Promise<void> => {
    if (await ctx.cashed()) {
        return;
    }
    await next();
};

routerV2.get('/admin/:iso', isCached, ViirsV2FiresRouter.getAdm0);
routerV2.get('/admin/:iso/:id1', isCached, ViirsV2FiresRouter.getAdm1);
routerV2.get('/admin/:iso/:id1/:id2', isCached, ViirsV2FiresRouter.getAdm2);
routerV2.get('/use/:name/:id', isCached, ViirsV2FiresRouter.use);
routerV2.get('/wdpa/:id', isCached, ViirsV2FiresRouter.wdpa);
routerV2.get('/', isCached, ViirsV2FiresRouter.world);
routerV2.post('/', ViirsV2FiresRouter.worldWithGeojson);
routerV2.get('/latest', isCached, ViirsV2FiresRouter.latest);


export default routerV2;
