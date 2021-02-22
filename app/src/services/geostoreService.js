const logger = require('logger');
const JSONAPIDeserializer = require('jsonapi-serializer').Deserializer;
const { RWAPIMicroservice } = require('rw-api-microservice-node');

const deserializer = async (obj) => new JSONAPIDeserializer({ keyForAttribute: 'camelCase' }).deserialize(obj);

class GeostoreService {

    static async getGeostore(path) {
        logger.debug('Obtaining geostore with path %s', path);
        let result;

        try {
            result = await RWAPIMicroservice.requestToMicroservice({
                uri: `/geostore/${path}`,
                method: 'GET',
                json: true
            });
        } catch (err) {
            logger.error('Error obtaining geostore:');
            logger.error(err);
            return null;

        }

        return deserializer(result);
    }

    static async getGeostoreByHash(hash) {
        logger.debug('Getting geostore');
        return GeostoreService.getGeostore(hash);
    }

    static async getGeostoreByIso(iso) {
        logger.debug('Getting geostore by iso');
        return GeostoreService.getGeostore(`admin/${iso}`);
    }

    static async getGeostoreByIsoAndId(iso, id1) {
        logger.debug('Getting geostore by iso and region');
        return GeostoreService.getGeostore(`admin/${iso}/${id1}`);
    }

    static async getGeostoreByUse(useTable, id) {
        logger.debug('Getting geostore by use');
        return GeostoreService.getGeostore(`use/${useTable}/${id}`);
    }

    static async getGeostoreByWdpa(wdpaid) {
        logger.debug('Getting geostore by use');
        return GeostoreService.getGeostore(`wdpa/${wdpaid}`);
    }

    static async createGeostore(geojson) {
        logger.debug('Create geostore from geojson: %s', geojson);

        let result;

        try {
            result = await RWAPIMicroservice.requestToMicroservice({
                uri: `/geostore`,
                method: 'POST',
                json: true,
                body: {
                    geojson
                }
            });
        } catch (err) {
            logger.error('Error obtaining geostore:');
            logger.error(err);
            return null;

        }

        return deserializer(result);
    }

}

module.exports = GeostoreService;
