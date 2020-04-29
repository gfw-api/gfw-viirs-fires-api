const Router = require('koa-router');
const logger = require('logger');
const DatasetService = require('services/datasetService');
const NotFound = require('errors/notFound');
const ViirsFiresSerializerV2 = require('serializers/viirsFiresSerializerV2');


const router = new Router({
    prefix: '/viirs-active-fires'
});

class ViirsFiresRouterV2 {

    static* getAdm0() {
        logger.info('Obtaining national data');
        const data = yield DatasetService.getAdm(this.params.iso, this.query.forSubscription, this.query.period, this.query.group === 'true');
        logger.debug('obtained ', data);
        this.body = ViirsFiresSerializerV2.serialize(data);
    }

    static* getAdm1() {
        logger.info('Obtaining subnational data');
        const data = yield DatasetService.getAdm(this.params.iso, this.query.forSubscription, this.query.period, this.query.group === 'true', this.params.id1);
        this.body = ViirsFiresSerializerV2.serialize(data);
    }

    static* getAdm2() {
        logger.info('Obtaining region data');
        const data = yield DatasetService.getAdm(this.params.iso, this.query.forSubscription, this.query.period, this.query.group === 'true', this.params.id1, this.params.id2);
        this.body = ViirsFiresSerializerV2.serialize(data);
    }

    static* use() {
        logger.info('Obtaining use data with name %s and id %s', this.params.name, this.params.id);
        const data = yield DatasetService.getUse(this.params.name, this.params.id, this.query.forSubscription, this.query.period, this.query.group === 'true');
        this.body = ViirsFiresSerializerV2.serialize(data);

    }

    static* wdpa() {
        logger.info('Obtaining wpda data with id %s', this.params.id);
        const data = yield DatasetService.getWdpa(this.params.id, this.query.forSubscription, this.query.period, this.query.group === 'true');
        this.body = ViirsFiresSerializerV2.serialize(data);
    }

    static* world() {
        logger.info('Obtaining world data');
        try {
            const data = yield DatasetService.getWorld(this.query.geostore, this.query.forSubscription, this.query.period, this.query.group === 'true');

            this.body = ViirsFiresSerializerV2.serialize(data);
        } catch (err) {
            if (err instanceof NotFound) {
                this.throw(404, 'Geostore not found');
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

    static* worldWithGeojson() {
        logger.info('Obtaining world data with geostore');
        this.assert(this.request.body.geojson, 400, 'GeoJSON param required');
        try {
            const data = yield DatasetService.getWorldWithGeojson(
                ViirsFiresRouterV2.checkGeojson(this.request.body.geojson),
                this.query.forSubscription,
                this.query.period,
                this.query.group === 'true'
            );

            this.body = ViirsFiresSerializerV2.serialize(data);
        } catch (err) {
            if (err instanceof NotFound) {
                this.throw(404, 'Geostore not found');
                return;
            }
            throw err;
        }

    }

    static* latest() {
        logger.info('Obtaining latest data');
        const data = yield DatasetService.latest(1);
        this.body = ViirsFiresSerializerV2.serializeLatest(data);
    }

}

const isCached = function* isCached(next) {
    if (yield this.cashed()) {
        return;
    }
    yield next;
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
