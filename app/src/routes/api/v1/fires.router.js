const Router = require('koa-router');
const logger = require('logger');
const DatasetService = require('services/datasetService');
const NotFound = require('errors/notFound');
const ViirsFiresSerializer = require('serializers/viirsFiresSerializer');


const router = new Router({
    prefix: '/viirs-active-fires'
});

class ViirsFiresRouter {

    static async getNational(ctx) {
        logger.info('Obtaining national data for iso %s and period %s', ctx.request.params.iso, ctx.request.query.period);
        const data = await DatasetService.getAdm(ctx.request.params.iso, ctx.request.query.forSubscription, ctx.request.query.period, ctx.request.query.group === 'true');
        logger.debug('obtained ', data);
        ctx.response.body = ViirsFiresSerializer.serialize(data);
    }

    static async getSubnational(ctx) {
        logger.info('Obtaining subnational data');
        const data = await DatasetService.getAdm(ctx.request.params.iso, ctx.request.query.forSubscription, ctx.request.query.period, ctx.request.query.group === 'true', ctx.request.params.id1);
        ctx.response.body = ViirsFiresSerializer.serialize(data);
    }

    static async getRegion(ctx) {
        logger.info('Obtaining region data');
        const data = await DatasetService.getAdm(ctx.request.params.iso, ctx.request.query.forSubscription, ctx.request.query.period, ctx.request.query.group === 'true', ctx.request.params.id1, ctx.request.params.id2);
        ctx.response.body = ViirsFiresSerializer.serialize(data);
    }

    static async use(ctx) {
        logger.info('Obtaining use data with name %s and id %s', ctx.request.params.name, ctx.request.params.id);
        let useTable = null;
        switch (ctx.request.params.name) {

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
                useTable = ctx.request.params.name;

        }
        if (!useTable) {
            ctx.throw(404, 'Name not found');
        }
        const data = await DatasetService.getUse(ctx.request.params.name, useTable, ctx.request.params.id, ctx.request.query.forSubscription, ctx.request.query.period, ctx.request.query.group === 'true');
        ctx.response.body = ViirsFiresSerializer.serialize(data);

    }

    static async wdpa(ctx) {
        logger.info('Obtaining wpda data with id %s', ctx.request.params.id);
        const data = await DatasetService.getWdpa(ctx.request.params.id, ctx.request.query.forSubscription, ctx.request.query.period, ctx.request.query.group === 'true');
        ctx.response.body = ViirsFiresSerializer.serialize(data);
    }

    static async world(ctx) {
        logger.info('Obtaining world data');
        ctx.assert(ctx.request.query.geostore, 400, 'GeoJSON param required');
        try {
            const data = await DatasetService.getWorld(ctx.request.query.geostore, ctx.request.query.forSubscription, ctx.request.query.period, ctx.request.query.group === 'true');

            ctx.response.body = ViirsFiresSerializer.serialize(data);
        } catch (err) {
            if (err instanceof NotFound) {
                ctx.throw(404, 'Geostore not found');
                return;
            }
            throw err;
        }
    }

    static checkGeojson(geojson) {
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

    static async worldWithGeojson(ctx) {
        logger.info('Obtaining world data with geostore');
        ctx.assert(ctx.request.body.geojson, 400, 'GeoJSON param required');
        try {
            const data = await DatasetService.getWorldWithGeojson(
                ViirsFiresRouter.checkGeojson(ctx.request.body.geojson),
                ctx.request.query.forSubscription,
                ctx.request.query.period,
                ctx.request.query.group === 'true'
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

    static async latest(ctx) {
        logger.info('Obtaining latest data');
        const data = await DatasetService.latest();
        ctx.response.body = ViirsFiresSerializer.serializeLatest(data);
    }

}

const isCached = async (ctx, next) => {
    if (await ctx.cashed()) {
        return;
    }
    await next();
};


router.get('/admin/:iso', isCached, ViirsFiresRouter.getNational);
router.get('/admin/:iso/:id1', isCached, ViirsFiresRouter.getSubnational);
router.get('/admin/:iso/:id1/:id2', isCached, ViirsFiresRouter.getRegion);
router.get('/use/:name/:id', isCached, ViirsFiresRouter.use);
router.get('/wdpa/:id', isCached, ViirsFiresRouter.wdpa);
router.get('/', isCached, ViirsFiresRouter.world);
router.post('/', ViirsFiresRouter.worldWithGeojson);
router.get('/latest', isCached, ViirsFiresRouter.latest);


module.exports = router;
