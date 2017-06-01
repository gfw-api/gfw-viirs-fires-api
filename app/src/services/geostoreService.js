'use strict';

const logger = require('logger');
const JSONAPIDeserializer = require('jsonapi-serializer').Deserializer;


var deserializer = function(obj) {
    return function(callback) {
        new JSONAPIDeserializer({keyForAttribute: 'camelCase'}).deserialize(obj, callback);
    };
};


class GeostoreService {
    static * getGeostore(path) {
        logger.debug('Obtaining geostore with path %s', path);
        let result = yield require('vizz.microservice-client').requestToMicroservice({
            uri: '/geostore/' + path,
            method: 'GET',
            json: true
        });
        if (result.statusCode !== 200) {
            console.error('Error obtaining geostore:');
            console.error(result);
            return null;
        }
        return yield deserializer(result.body);
    }

    static * getGeostoreByHash(hash) {
        logger.debug('Getting geostore');
        return yield GeostoreService.getGeostore(hash);
    }

    static * getGeostoreByIso(iso) {
        logger.debug('Getting geostore by iso');
        return yield GeostoreService.getGeostore(`admin/${iso}`);
    }

    static * getGeostoreByIsoAndId(iso, id1) {
        logger.debug('Getting geostore by iso and region');
        return yield GeostoreService.getGeostore(`admin/${iso}/${id1}`);
    }

    static * getGeostoreByUse(useTable, id) {
        logger.debug('Getting geostore by use');
        return yield GeostoreService.getGeostore(`use/${useTable}/${id}`);
    }

    static * getGeostoreByWdpa(wdpaid) {
        logger.debug('Getting geostore by use');
        return yield GeostoreService.getGeostore(`wdpa/${wdpaid}`);
    }
}

module.exports = GeostoreService;
