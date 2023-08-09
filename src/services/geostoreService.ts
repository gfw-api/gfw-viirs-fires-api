import logger from 'logger';
import { RWAPIMicroservice } from "rw-api-microservice-node";
import { Deserializer } from 'jsonapi-serializer';


class GeostoreService {

    static async getGeostore(path: string, apiKey: string): Promise<Record<string, any>> {
        logger.debug('Obtaining geostore with path %s', path);
        let result: Record<string, any>;

        try {
            result = await RWAPIMicroservice.requestToMicroservice({
                uri: `/v1/geostore/${path}`,
                method: 'GET',
                headers: {
                    'x-api-key': apiKey,
                }
            });
        } catch (err) {
            logger.error('Error obtaining geostore:');
            logger.error(err);
            return null;

        }

        return await new Deserializer({
            keyForAttribute: 'camelCase'
        }).deserialize(result);
    }

    static async getGeostoreByHash(hash: string, apiKey: string): Promise<Record<string, any>> {
        logger.debug('Getting geostore');
        return GeostoreService.getGeostore(hash, apiKey);
    }

    static async getGeostoreByIso(iso: string, apiKey: string): Promise<Record<string, any>> {
        logger.debug('Getting geostore by iso');
        return GeostoreService.getGeostore(`admin/${iso}`, apiKey);
    }

    static async getGeostoreByIsoAndId(iso: string, id1: string, apiKey: string): Promise<Record<string, any>> {
        logger.debug('Getting geostore by iso and region');
        return GeostoreService.getGeostore(`admin/${iso}/${id1}`, apiKey);
    }

    static async getGeostoreByUse(useTable: string, id: string, apiKey: string): Promise<Record<string, any>> {
        logger.debug('Getting geostore by use');
        return GeostoreService.getGeostore(`use/${useTable}/${id}`, apiKey);
    }

    static async getGeostoreByWdpa(wdpaid: string, apiKey: string): Promise<Record<string, any>> {
        logger.debug('Getting geostore by use');
        return GeostoreService.getGeostore(`wdpa/${wdpaid}`, apiKey);
    }

    static async createGeostore(geojson:  Record<string, any>, apiKey: string): Promise<Record<string, any>> {
        logger.debug('Create geostore from geojson: %s', geojson);

        let result: Record<string, any>;

        try {
            result = await RWAPIMicroservice.requestToMicroservice({
                uri: `/v1/geostore`,
                method: 'POST',
                body: {
                    geojson
                },
                headers: {
                    'x-api-key': apiKey,
                }
            });
        } catch (err) {
            logger.error('Error obtaining geostore:');
            logger.error(err);
            return null;
        }

        return await new Deserializer({
            keyForAttribute: 'camelCase'
        }).deserialize(result);
    }

}

export default GeostoreService;
