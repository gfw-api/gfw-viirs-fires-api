const Router = require('koa-router');
const logger = require('logger');
const DatasetService = require('services/datasetService');
const NotFound = require('errors/notFound');
const ViirsFiresSerializerV2 = require('serializers/viirsFiresSerializerV2');


const router = new Router({
    prefix: '/viirs-active-fires'
});

class ViirsFiresRouterV2 {

    static async getAdm0(ctx) {
        logger.info('Obtaining national data');
        const data = await DatasetService.getAdm(ctx.request.params.iso, ctx.request.query.forSubscription, ctx.request.query.period, ctx.request.query.group === 'true');
        logger.debug('obtained ', data);
        ctx.response.body = ViirsFiresSerializerV2.serialize(data);
    }

    static async getAdm1(ctx) {
        logger.info('Obtaining subnational data');
        const data = await DatasetService.getAdm(ctx.request.params.iso, ctx.request.query.forSubscription, ctx.request.query.period, ctx.request.query.group === 'true', ctx.request.params.id1);
        ctx.response.body = ViirsFiresSerializerV2.serialize(data);
    }

    static async getAdm2(ctx) {
        logger.info('Obtaining region data');
        const data = await DatasetService.getAdm(ctx.request.params.iso, ctx.request.query.forSubscription, ctx.request.query.period, ctx.request.query.group === 'true', ctx.request.params.id1, ctx.request.params.id2);
        ctx.response.body = ViirsFiresSerializerV2.serialize(data);
    }

    static async use(ctx) {
        logger.info('Obtaining use data with name %s and id %s', ctx.request.params.name, ctx.request.params.id);
        const data = await DatasetService.getUse(ctx.request.params.name, ctx.request.params.id, ctx.request.query.forSubscription, ctx.request.query.period, ctx.request.query.group === 'true');
        ctx.response.body = ViirsFiresSerializerV2.serialize(data);

    }

    static async wdpa(ctx) {
        logger.info('Obtaining wpda data with id %s', ctx.request.params.id);
        const data = await DatasetService.getWdpa(ctx.request.params.id, ctx.request.query.forSubscription, ctx.request.query.period, ctx.request.query.group === 'true');
        ctx.response.body = ViirsFiresSerializerV2.serialize(data);
    }

    static async world(ctx) {
        logger.info('Obtaining world data');
        try {
            const data = await DatasetService.getWorld(ctx.request.query.geostore, ctx.request.query.forSubscription, ctx.request.query.period, ctx.request.query.group === 'true');

            ctx.response.body = ViirsFiresSerializerV2.serialize(data);
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
                ViirsFiresRouterV2.checkGeojson(ctx.request.body.geojson),
                ctx.request.query.forSubscription,
                ctx.request.query.period,
                ctx.request.query.group === 'true'
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

    static async latest(ctx) {
        logger.info('Obtaining latest data');
        const data = await DatasetService.latest();
        ctx.response.body = ViirsFiresSerializerV2.serializeLatest(data);
    }

}

const isCached = async (ctx, next) => {
    if (await ctx.cashed()) {
        return;
    }
    await next();
};

router.get('/admin/:iso', isCached, ViirsFiresRouterV2.getAdm0);
router.get('/admin/:iso/:id1', isCached, ViirsFiresRouterV2.getAdm1);
router.get('/admin/:iso/:id1/:id2', isCached, ViirsFiresRouterV2.getAdm2);
router.get('/use/:name/:id', isCached, ViirsFiresRouterV2.use);
router.get('/wdpa/:id', isCached, ViirsFiresRouterV2.wdpa);
router.get('/', isCached, ViirsFiresRouterV2.world);
router.post('/', ViirsFiresRouterV2.worldWithGeojson);
router.get('/latest', isCached, ViirsFiresRouterV2.latest);


module.exports = router;
