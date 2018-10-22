'use strict';

var Router = require('koa-router');
var logger = require('logger');
var CartoDBServiceV2 = require('services/cartoDBServiceV2');
var NotFound = require('errors/notFound');
var ViirsFiresSerializerV2 = require('serializers/viirsFiresSerializerV2');


var router = new Router({
    prefix: '/viirs-active-fires'
});

class ViirsFiresRouterV2 {
    static * getAdm0() {
        logger.info('Obtaining national data');
        let data = yield CartoDBServiceV2.getAdm0(this.params.iso, this.query.forSubscription, this.query.period, this.query.group === 'true');
        logger.debug('obtained ', data);
        this.body = ViirsFiresSerializerV2.serialize(data);
    }

    static * getAdm1() {
        logger.info('Obtaining subnational data');
        let data = yield CartoDBServiceV2.getAdm1(this.params.iso, this.params.id1, this.query.forSubscription, this.query.period, this.query.group === 'true');
        this.body = ViirsFiresSerializerV2.serialize(data);
    }

    static * getAdm2() {
        logger.info('Obtaining region data');
        let data = yield CartoDBServiceV2.getAdm2(this.params.iso, this.params.id1, this.params.id2, this.query.forSubscription, this.query.period, this.query.group === 'true');
        this.body = ViirsFiresSerializerV2.serialize(data);
    }

    static * use() {
        logger.info('Obtaining use data with name %s and id %s', this.params.name, this.params.id);
        let data = yield CartoDBServiceV2.getUse(this.params.name, this.params.id, this.query.forSubscription, this.query.period, this.query.group === 'true');
        this.body = ViirsFiresSerializerV2.serialize(data);

    }

    static * wdpa() {
        logger.info('Obtaining wpda data with id %s', this.params.id);
        let data = yield CartoDBServiceV2.getWdpa(this.params.id, this.query.forSubscription, this.query.period, this.query.group === 'true');
        this.body = ViirsFiresSerializerV2.serialize(data);
    }

    static * world() {
        logger.info('Obtaining world data');
        this.assert(this.query.geostore, 400, 'GeoJSON param required');
        try {
            let data = yield CartoDBServiceV2.getWorld(this.query.geostore, this.query.forSubscription, this.query.period, this.query.group === 'true');

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
        if (geojson.type.toLowerCase() === 'polygon'){
            return {
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    geometry: geojson
                }]
            };
        } else if (geojson.type.toLowerCase() === 'feature') {
            return {
                type: 'FeatureCollection',
                features: [geojson]
            };
        } 
        return geojson;
    }

    static * worldWithGeojson() {
        logger.info('Obtaining world data with geostore');
        this.assert(this.request.body.geojson, 400, 'GeoJSON param required');
        try{            
            let data = yield CartoDBServiceV2.getWorldWithGeojson(ViirsFiresRouterV2.checkGeojson(this.request.body.geojson), this.query.forSubscription, this.query.period, null,  this.query.group === 'true');
            this.body = ViirsFiresSerializerV2.serialize(data);
        } catch(err){
            if(err instanceof NotFound){
                this.throw(404, 'Geostore not found');
                return;
            }
            throw err;
        }

    }

    static * latest() {
        logger.info('Obtaining latest data');
        let data = yield CartoDBServiceV2.latest(this.query.limit);
        this.body = ViirsFiresSerializerV2.serializeLatest(data);
    }

}

var isCached = function*(next) {
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
