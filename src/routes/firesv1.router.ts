import Router from 'koa-router';
import logger from 'logger';
import { Context, Next } from 'koa';
import DatasetService from 'services/datasetService';
import ViirsFiresSerializer from 'serializers/viirsFiresSerializer';
import NotFound from 'errors/notFound';


const routerV1: Router = new Router({
    prefix: '/api/v1/viirs-active-fires'
});

class ViirsV1FiresRouter {

    static async getNational(ctx: Context): Promise<void> {
        logger.info('Obtaining national data for iso %s and period %s', ctx.params.iso, ctx.request.query.period);
        const data: Record<string, any> = await DatasetService.getAdm(
            ctx.request.headers['x-api-key'] as string,
            ctx.params.iso as string,
            ctx.request.query.forSubscription as string,
            ctx.request.query.period as string,
            ctx.request.query.group === 'true'
        );
        logger.debug('obtained ', data);
        ctx.response.body = ViirsFiresSerializer.serialize(data);
    }

    static async getSubnational(ctx: Context): Promise<void> {
        logger.info('Obtaining subnational data');
        const data: Record<string, any> = await DatasetService.getAdm(
            ctx.request.headers['x-api-key'] as string,
            ctx.params.iso as string,
            ctx.request.query.forSubscription as string,
            ctx.request.query.period as string,
            ctx.request.query.group === 'true',
            ctx.params.id1 as string
        );
        ctx.response.body = ViirsFiresSerializer.serialize(data);
    }

    static async getRegion(ctx: Context): Promise<void> {
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
        ctx.response.body = ViirsFiresSerializer.serialize(data);
    }

    static async use(ctx: Context): Promise<void> {
        logger.info('Obtaining use data with name %s and id %s', ctx.params.name, ctx.params.id);
        let useTable: string = null;
        switch (ctx.params.name) {
            case 'mining':
                useTable = 'gfw_mining';
                break;
            case 'oilpalm':
                useTable = 'gfw_oil_palm';
                break;
            case 'fiber':
                useTable = 'gfw_wood_fiber';
                break;
            case 'logging':
                useTable = 'gfw_logging';
                break;
            default:
                useTable = ctx.params.name;

        }
        if (!useTable) {
            ctx.throw(404, 'Name not found');
        }
        const data: Record<string, any> = await DatasetService.getUse(
            useTable,
            ctx.params.id as string,
            ctx.request.query.forSubscription as string,
            ctx.request.query.period as string,
            ctx.request.query.group === 'true',
            ctx.request.headers['x-api-key'] as string
        );
        ctx.response.body = ViirsFiresSerializer.serialize(data);

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
        ctx.response.body = ViirsFiresSerializer.serialize(data);
    }

    static async world(ctx: Context): Promise<void> {
        logger.info('Obtaining world data');
        ctx.assert(ctx.request.query.geostore, 400, 'GeoJSON param required');
        try {
            const data: Record<string, any> = await DatasetService.getWorld(
                ctx.request.query.geostore as string,
                ctx.request.query.forSubscription as string,
                ctx.request.query.period as string,
                ctx.request.query.group === 'true',
                ctx.request.headers['x-api-key'] as string
            );

            ctx.response.body = ViirsFiresSerializer.serialize(data);
        } catch (err) {
            if (err instanceof NotFound) {
                ctx.throw(404, 'Geostore not found');
                return;
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
                ViirsV1FiresRouter.checkGeojson(ctx.request.body.geojson),
                ctx.request.query.forSubscription as string,
                ctx.request.query.period as string,
                ctx.request.query.group === 'true',
                ctx.request.headers['x-api-key'] as string,
            );

            ctx.response.body = ViirsFiresSerializer.serialize(data);
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
        const data: Record<string, any> = await DatasetService.latest(ctx.request.headers['x-api-key'] as string);
        ctx.response.body = ViirsFiresSerializer.serializeLatest(data);
    }

}

const isCached = async (ctx: Context, next: Next): Promise<void> => {
    if (await ctx.cashed()) {
        return;
    }
    await next();
};


routerV1.get('/admin/:iso', isCached, ViirsV1FiresRouter.getNational);
routerV1.get('/admin/:iso/:id1', isCached, ViirsV1FiresRouter.getSubnational);
routerV1.get('/admin/:iso/:id1/:id2', isCached, ViirsV1FiresRouter.getRegion);
routerV1.get('/use/:name/:id', isCached, ViirsV1FiresRouter.use);
routerV1.get('/wdpa/:id', isCached, ViirsV1FiresRouter.wdpa);
routerV1.get('/', isCached, ViirsV1FiresRouter.world);
routerV1.post('/', ViirsV1FiresRouter.worldWithGeojson);
routerV1.get('/latest', isCached, ViirsV1FiresRouter.latest);


export default routerV1;

