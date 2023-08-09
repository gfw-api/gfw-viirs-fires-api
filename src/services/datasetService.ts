import config from 'config';
import logger from 'logger';
import Mustache from 'mustache';
import GeostoreService from 'services/geostoreService';
import { RWAPIMicroservice } from "rw-api-microservice-node";


const NUM_ALERTS: string = `SELECT SUM(alert__count) AS value FROM table
    WHERE (confidence__cat = 'h' OR confidence__cat = 'n') 
     AND alert__date >= '{{begin}}'
     AND alert__date <= '{{end}}'`;

const SUMMARY_AREA: string = `SELECT SUM(area__ha) AS value FROM table WHERE`;

const LATEST: string = `SELECT alert__date as date
        FROM table ORDER BY alert__date DESC
        LIMIT {{limit}}`;

const getDateString = (date: Date): string => `${date.getFullYear().toString()}-${(`0${(date.getMonth() + 1).toString()}`).slice(-2)}-${(`0${date.getDate().toString()}`).slice(-2)}`;

function getToday(): string {
    const today: Date = new Date();
    return getDateString(today);
}

function getYesterday(): string {
    const yesterday: Date = new Date(Date.now() - (24 * 60 * 60 * 1000));
    return getDateString(yesterday);
}


function defaultDate(): string {
    const to: string = getToday();
    const from: string = getYesterday();
    return `${from},${to}`;
}

function getPeriodText(period: string): string {
    const periods: string[] = period.split(',');
    const days: number = (new Date(periods[1]).getTime() - new Date(periods[0]).getTime()) / (24 * 60 * 60 * 1000);

    switch (days) {

        case 1:
            return 'Past 24 hours';
        case 2:
            return 'Past 48 hours';
        case 3:
            return 'Past 72 hours';
        default:
            return 'Past week';

    }
}

// eslint-disable-next-line consistent-return
function getDownloadUrls(query: string, params: Record<string, any>, datasetId: string, geostore: string = null): Record<string, any> | void {
    try {
        const formats: string[] = ['csv', 'geojson', 'json'];
        const download: Record<string, any> = {};
        let queryFinal: string = Mustache.render(query, params);
        queryFinal = queryFinal.replace('SELECT SUM(alert__count) AS value', 'SELECT *');
        queryFinal = encodeURIComponent(queryFinal);
        for (let i: number = 0, { length } = formats; i < length; i++) {
            download[formats[i]] = `${config.get('datasets.uri')}/download/${datasetId}?sql=${queryFinal}&format=${formats[i]}`;
            if (geostore) {
                download[formats[i]] += `&geostore=${geostore}`;
            }
        }
        return download;
    } catch (err) {
        logger.error(err);
    }
}

function getURLForSubscription(query: string): string {
    return query.replace('SELECT SUM(alert__count) AS value', 'SELECT latitude, longitude, alert__date as acq_date, alert__time_utc as acq_time');
}

function getQueryForGroup(query: string): string {
    let queryFinal: string = query.replace('SELECT SUM(alert__count) AS value', 'SELECT alert__date as day, SUM(alert__count) as value');
    queryFinal += ' GROUP BY alert__date';
    return queryFinal;
}


class DatasetService {

    private static async queryDataset(apiKey: string, dataset: string, sql: string, params: Record<string, any> = {}, geostore: string = null): Promise<Record<string, any>> {
        const sqlRendered: string = Mustache.render(sql, params);
        logger.debug('Running dataset with sql: %s', sqlRendered);
        let uri: string = `/v1/query/${dataset}?sql=${encodeURIComponent(sqlRendered)}`;
        if (geostore) {
            uri += `&geostore=${geostore}`;
        }

        try {
            const result: Record<string, any> = await RWAPIMicroservice.requestToMicroservice({
                uri,
                method: 'GET',
                headers: {
                    'x-api-key': apiKey,
                }
            });
            return result;
        } catch (err) {
            logger.error('Error running query:');
            logger.error(err);
            return null;
        }
    }

    static async getAdm(apiKey: string, iso: string, forSubscription: string, period: string = defaultDate(), group: boolean = false, adm1: string = null, adm2: string = null): Promise<Record<string, any>> {
        logger.debug('Obtaining national of iso %s and period %s', iso, period);
        const periods: string[] = period.split(',');
        const params: {
            iso: string;
            end: string;
            begin: string;
            adm1?: string;
            adm2?: string;
        } = {
            iso,
            begin: periods[0],
            end: periods[1]
        };

        let alertQuery: string = NUM_ALERTS;
        let areaQuery: string = SUMMARY_AREA;

        alertQuery += ` AND iso = '{{iso}}'`;
        areaQuery += ` iso = '{{iso}}'`;

        if (adm1) {
            params.adm1 = adm1;
            alertQuery += ` AND adm1 = '{{adm1}}'`;
            areaQuery += ` AND adm1 = '{{adm1}}'`;

            if (adm2) {
                params.adm2 = adm2;
                alertQuery += ` AND adm2 = '{{adm2}}'`;
                areaQuery += ` AND adm2 = '{{adm2}}'`;
            }
        }

        const datasetIds: {
            all: string;
            summary: string;
            daily: string
        } = {
            daily: config.get('datasets.viirs_gadm_daily_id'),
            all: config.get('datasets.viirs_gadm_all_id'),
            summary: config.get('datasets.gadm_summary_id')
        };

        logger.debug(`All the way home`);

        return DatasetService.getViirsAlerts(apiKey, alertQuery, params, datasetIds, period, forSubscription, group, areaQuery);
    }

    static async getUse(useName: string, id: string, forSubscription: string, period: string = defaultDate(), group: boolean = false, apiKey: string): Promise<Record<string, any>> {
        logger.debug('Obtaining use with id %s', id);

        // no special table for use, so just get geostore hash and do query on all points with geostore filter
        const geostore: Record<string, any> = await GeostoreService.getGeostoreByUse(useName, id, apiKey);
        if (geostore) {
            return DatasetService.getWorld(geostore.data.id, forSubscription, period, group, apiKey);
        }
        return null;
    }

    static async getWdpa(wdpaid: string, forSubscription: string, period: string = defaultDate(), group: boolean = false, apiKey: string): Promise<Record<string, any>> {
        logger.debug('Obtaining wpda of id %s', wdpaid);
        const periods: string[] = period.split(',');
        const params: { end: string; begin: string; wdpaid: any } = {
            wdpaid,
            begin: periods[0],
            end: periods[1]
        };

        let alertQuery: string = NUM_ALERTS;
        let areaQuery: string = SUMMARY_AREA;

        alertQuery += ` AND wdpa_protected_area__id = '{{wdpaid}}'`;
        areaQuery += ` wdpa_protected_area__id = '{{wdpaid}}'`;

        const datasetIds: { all: string; summary: string; daily: string } = {
            daily: config.get('datasets.viirs_wdpa_daily_id'),
            all: config.get('datasets.viirs_gadm_all_id'),
            summary: config.get('datasets.wdpa_summary_id')
        };

        const geostore: Record<string, any> = await GeostoreService.getGeostoreByWdpa(wdpaid, apiKey);
        const geostoreHash: string = geostore.id;

        return DatasetService.getViirsAlerts(apiKey, alertQuery, params, datasetIds, period, forSubscription, group, areaQuery, geostoreHash);
    }


    static async getWorld(hashGeoStore: string, forSubscription: string, period: string = defaultDate(), group: boolean = false, apiKey: string): Promise<Record<string, any>> {
        logger.debug('Obtaining world with hashGeoStore %s', hashGeoStore);
        const periods: string[] = period.split(',');
        const params: { end: string; begin: string } = {
            begin: periods[0],
            end: periods[1]
        };
        const alertQuery: string = NUM_ALERTS;

        const datasetIds: { all: string } = {
            all: config.get('datasets.viirs_gadm_all_id'),
        };

        return DatasetService.getViirsAlerts(apiKey, alertQuery, params, datasetIds, period, forSubscription, group, null, hashGeoStore);
    }

    static async getWorldWithGeojson(geojson: Record<string, any>, forSubscription: string, period: string = defaultDate(), group: boolean = false, apiKey: string): Promise<Record<string, any>> {
        logger.debug('Executing query with geojson', geojson);
        const newGeostore: Record<string, any> = await GeostoreService.createGeostore(geojson, apiKey);

        logger.debug(`Create new geostore: ${JSON.stringify(newGeostore)}`);
        const geostoreHash: string = newGeostore.id;
        return this.getWorld(geostoreHash, forSubscription, period, group, apiKey);
    }

    static async getViirsAlerts(
        apiKey: string,
        alertQuery: string,
        queryParams: Record<string, any>,
        datasetIds: {
            all: string;
            summary?: string;
            daily?: string
        },
        period: string,
        forSubscription: string,
        group: boolean,
        areaQuery: string = null,
        geostore: string = null): Promise<Record<string, any>> {

        if (forSubscription) {
            const query: string = getURLForSubscription(alertQuery);
            const result: Record<string, any> = await DatasetService.queryDataset(apiKey, datasetIds.all, query, queryParams, geostore);
            return result.data;
        }
        if (group) {
            const query: string = getQueryForGroup(alertQuery);
            let result: Record<string, any>;
            if (datasetIds.daily) {
                result = await DatasetService.queryDataset(apiKey, datasetIds.daily, query, queryParams);
            } else {
                result = await DatasetService.queryDataset(apiKey, datasetIds.all, query, queryParams, geostore);
            }
            return result.data;
        }

        let numAlertsResponse: Record<string, any>;
        if (datasetIds.daily) {
            numAlertsResponse = await DatasetService.queryDataset(apiKey, datasetIds.daily, alertQuery, queryParams);
        } else {
            numAlertsResponse = await DatasetService.queryDataset(apiKey, datasetIds.all, alertQuery, queryParams, geostore);
        }

        let numAlerts: number = 0;
        if (numAlertsResponse && numAlertsResponse.data) {
            numAlerts = numAlertsResponse.data[0].value;
        }

        let areaHa: any = null;
        if (areaQuery) {
            const areaHaResponse: Record<string, any> = await DatasetService.queryDataset(apiKey, datasetIds.summary, areaQuery, queryParams);
            if (areaHaResponse && areaHaResponse.data) {
                areaHa = areaHaResponse.data[0].value;
            }
        } else if (geostore) {
            const geostoreResponse: Record<string, any> = await GeostoreService.getGeostoreByHash(geostore, apiKey);
            if (geostoreResponse) {
                areaHa = geostoreResponse.areaHa;
            }
        }

        const result: Record<string, any> = {};
        result.value = numAlerts;
        result.area_ha = areaHa;
        result.period = getPeriodText(period);
        result.downloadUrls = getDownloadUrls(alertQuery, queryParams, datasetIds.all, geostore);
        return result;
    }

    static async latest(apiKey: string, limit: number = 1): Promise<any> {
        logger.debug('Obtaining latest with limit %s', limit);
        const params: { limit: number } = {
            limit
        };
        const response: Record<string, any> = await DatasetService.queryDataset(apiKey, config.get('datasets.viirs_gadm_all_id'), LATEST, params);
        logger.debug('response', response);
        if (response.data && response.data.length > 0) {
            // for some reason DISTINCT doesn't work for ES, so just returning latest
            const result: any = response.data[0];
            result.latest = result.date;
            return result;
        }
        return null;
    }

}

export default DatasetService;
