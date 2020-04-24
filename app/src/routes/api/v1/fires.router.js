const Router = require('koa-router');
const logger = require('logger');
const CartoDBService = require('services/cartoDBService');
const DatasetService = require('services/datasetService');
const NotFound = require('errors/notFound');
const ViirsFiresSerializer = require('serializers/viirsFiresSerializer');


const router = new Router({
    prefix: '/viirs-active-fires'
});

class ViirsFiresRouter {

    static* getNational() {
        logger.info('Obtaining national data for iso %s and period %s', this.params.iso, this.query.period);
        const data = yield DatasetService.getAdm(this.params.iso, this.query.forSubscription, this.query.period, this.query.group === 'true');
        logger.debug('obtained ', data);
        this.body = ViirsFiresSerializer.serialize(data);
    }

    static* getSubnational() {
        logger.info('Obtaining subnational data');
        const data = yield CartoDBService.getSubnational(this.params.iso, this.params.id1, this.query.forSubscription, this.query.period, this.query.group === 'true');
        this.body = ViirsFiresSerializer.serialize(data);
    }

    static* getRegion() {
        logger.info('Obtaining region data');
        const data = yield CartoDBService.getRegion(this.params.iso, this.params.id1, this.params.id2, this.query.forSubscription, this.query.period, this.query.group === 'true');
        this.body = ViirsFiresSerializer.serialize(data);
    }

    static* use() {
        logger.info('Obtaining use data with name %s and id %s', this.params.name, this.params.id);
        let useTable = null;
        switch (this.params.name) {

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
                useTable = this.params.name;

        }
        if (!useTable) {
            this.throw(404, 'Name not found');
        }
        const data = yield CartoDBService.getUse(this.params.name, useTable, this.params.id, this.query.forSubscription, this.query.period, this.query.group === 'true');
        this.body = ViirsFiresSerializer.serialize(data);

    }

    static* wdpa() {
        logger.info('Obtaining wpda data with id %s', this.params.id);
        const data = yield CartoDBService.getWdpa(this.params.id, this.query.forSubscription, this.query.period, this.query.group === 'true');
        this.body = ViirsFiresSerializer.serialize(data);
    }

    static* world() {
        logger.info('Obtaining world data');
        this.assert(this.query.geostore, 400, 'GeoJSON param required');
        try {
            const data = yield CartoDBService.getWorld(this.query.geostore, this.query.forSubscription, this.query.period, this.query.group === 'true');

            this.body = ViirsFiresSerializer.serialize(data);
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
            const data = yield CartoDBService.getWorldWithGeojson(
                ViirsFiresRouter.checkGeojson(this.request.body.geojson),
                this.query.forSubscription,
                this.query.period,
                this.query.group === 'true'
            );

            this.body = ViirsFiresSerializer.serialize(data);
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
        const data = yield CartoDBService.latest(this.query.limit);
        this.body = ViirsFiresSerializer.serializeLatest(data);
    }

}

const isCached = function* isCached(next) {
    if (yield this.cashed()) {
        return;
    }
    yield next;
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
