const logger = require('logger');
const config = require('config');
const Mustache = require('mustache');
const GeostoreService = require('services/geostoreService');
const { RWAPIMicroservice } = require('rw-api-microservice-node');

const NUM_ALERTS = `SELECT SUM(alert__count) AS value FROM table
    WHERE (confidence__cat = 'h' OR confidence__cat = 'n') 
     AND alert__date >= '{{begin}}'
     AND alert__date <= '{{end}}'`;

const SUMMARY_AREA = `SELECT SUM(area__ha) AS value FROM table WHERE`;

const LATEST = `SELECT alert__date as date
        FROM table ORDER BY alert__date DESC
        LIMIT {{limit}}`;

const getDateString = (date) => `${date.getFullYear().toString()}-${(`0${(date.getMonth() + 1).toString()}`).slice(-2)}-${(`0${date.getDate().toString()}`).slice(-2)}`;

const getToday = () => {
    const today = new Date();
    return getDateString(today);
};

const getYesterday = () => {
    const yesterday = new Date(Date.now() - (24 * 60 * 60 * 1000));
    return getDateString(yesterday);
};


const defaultDate = () => {
    const to = getToday();
    const from = getYesterday();
    return `${from},${to}`;
};

const getPeriodText = (period) => {
    const periods = period.split(',');
    const days = (new Date(periods[1]) - new Date(periods[0])) / (24 * 60 * 60 * 1000);

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
};

// eslint-disable-next-line consistent-return
const getDownloadUrls = (query, params, datasetId, geostore = null) => {
    try {
        const formats = ['csv', 'geojson', 'json'];
        const download = {};
        let queryFinal = Mustache.render(query, params);
        queryFinal = queryFinal.replace('SELECT SUM(alert__count) AS value', 'SELECT *');
        queryFinal = encodeURIComponent(queryFinal);
        for (let i = 0, { length } = formats; i < length; i++) {
            download[formats[i]] = `${config.get('datasets.uri')}/download/${datasetId}?sql=${queryFinal}&format=${formats[i]}`;
            if (geostore) {
                download[formats[i]] += `&geostore=${geostore}`;
            }
        }
        return download;
    } catch (err) {
        logger.error(err);
    }
};

const getURLForSubscription = (query) => {
    const queryFinal = query.replace('SELECT SUM(alert__count) AS value', 'SELECT latitude, longitude, alert__date as acq_date, alert__time_utc as acq_time');
    return queryFinal;
};

const getQueryForGroup = (query) => {
    let queryFinal = query.replace('SELECT SUM(alert__count) AS value', 'SELECT alert__date as day, SUM(alert__count) as value');
    queryFinal += ' GROUP BY alert__date';
    return queryFinal;
};


class DatasetService {

    static async queryDataset(dataset, sql, params = {}, geostore = null) {
        const sqlRendered = Mustache.render(sql, params);
        logger.debug('Running dataset with sql: %s', sqlRendered);
        let uri = `/query/${dataset}?sql=${encodeURIComponent(sqlRendered)}`;
        if (geostore) {
            uri += `&geostore=${geostore}`;
        }

        try {
            const result = await RWAPIMicroservice.requestToMicroservice({
                uri,
                method: 'GET',
                json: true
            });
            return result;
        } catch (err) {
            logger.error('Error running query:');
            logger.error(err);
            return null;
        }
    }

    static async getAdm(iso, forSubscription, period = defaultDate(), group = false, adm1 = null, adm2 = null) {
        logger.debug('Obtaining national of iso %s and period %s', iso, period);
        const periods = period.split(',');
        const params = {
            iso,
            begin: periods[0],
            end: periods[1]
        };

        let alertQuery = NUM_ALERTS;
        let areaQuery = SUMMARY_AREA;

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

        const datasetIds = {
            daily: config.get('datasets.viirs_gadm_daily_id'),
            all: config.get('datasets.viirs_gadm_all_id'),
            summary: config.get('datasets.gadm_summary_id')
        };

        logger.debug(`All the way home`);

        return DatasetService.getViirsAlerts(alertQuery, params, datasetIds, period, forSubscription, group, areaQuery);
    }

    static async getUse(useName, useTable, id, forSubscription, period = defaultDate(), group = false) {
        logger.debug('Obtaining use with id %s', id);

        // no special table for use, so just get geostore hash and do query on all points with geostore filter
        const geostore = await GeostoreService.getGeostoreByUse(useName, id);
        if (geostore) {
            return DatasetService.getWorld(geostore.data.id, forSubscription, period, group);
        }
        return null;
    }

    static async getWdpa(wdpaid, forSubscription, period = defaultDate(), group = false) {
        logger.debug('Obtaining wpda of id %s', wdpaid);
        const periods = period.split(',');
        const params = {
            wdpaid,
            begin: periods[0],
            end: periods[1]
        };

        let alertQuery = NUM_ALERTS;
        let areaQuery = SUMMARY_AREA;

        alertQuery += ` AND wdpa_protected_area__id = '{{wdpaid}}'`;
        areaQuery += ` wdpa_protected_area__id = '{{wdpaid}}'`;

        const datasetIds = {
            daily: config.get('datasets.viirs_wdpa_daily_id'),
            all: config.get('datasets.viirs_gadm_all_id'),
            summary: config.get('datasets.wdpa_summary_id')
        };

        const geostore = await GeostoreService.getGeostoreByWdpa(wdpaid);
        const geostoreHash = geostore.id;

        return DatasetService.getViirsAlerts(alertQuery, params, datasetIds, period, forSubscription, group, areaQuery, geostoreHash);
    }


    static async getWorld(hashGeoStore, forSubscription, period = defaultDate(), group = false) {
        logger.debug('Obtaining world with hashGeoStore %s', hashGeoStore);
        const periods = period.split(',');
        const params = {
            begin: periods[0],
            end: periods[1]
        };
        const alertQuery = NUM_ALERTS;

        const datasetIds = {
            all: config.get('datasets.viirs_gadm_all_id'),
        };

        return DatasetService.getViirsAlerts(alertQuery, params, datasetIds, period, forSubscription, group, null, hashGeoStore);
    }

    static async getWorldWithGeojson(geojson, forSubscription, period = defaultDate(), group = false) {
        logger.debug('Executing query with geojson', geojson);
        const newGeostore = await GeostoreService.createGeostore(geojson);

        logger.debug(`Create new geostore: ${JSON.stringify(newGeostore)}`);
        const geostoreHash = newGeostore.id;
        return this.getWorld(geostoreHash, forSubscription, period, group);
    }

    static async getViirsAlerts(alertQuery, queryParams, datasetIds, period, forSubscription, group, areaQuery = null, geostore = null) {
        if (forSubscription) {
            const query = getURLForSubscription(alertQuery);
            const result = await DatasetService.queryDataset(datasetIds.all, query, queryParams, geostore);
            return result.data;
        }
        if (group) {
            const query = getQueryForGroup(alertQuery);
            let result = null;
            if (datasetIds.daily) {
                result = await DatasetService.queryDataset(datasetIds.daily, query, queryParams);
            } else {
                result = await DatasetService.queryDataset(datasetIds.all, query, queryParams, geostore);
            }
            return result.data;
        }

        let numAlertsResponse = null;
        if (datasetIds.daily) {
            numAlertsResponse = await DatasetService.queryDataset(datasetIds.daily, alertQuery, queryParams);
        } else {
            numAlertsResponse = await DatasetService.queryDataset(datasetIds.all, alertQuery, queryParams, geostore);
        }

        let numAlerts = 0;
        if (numAlertsResponse && numAlertsResponse.data) {
            numAlerts = numAlertsResponse.data[0].value;
        }

        let areaHa = null;
        if (areaQuery) {
            const areaHaResponse = await DatasetService.queryDataset(datasetIds.summary, areaQuery, queryParams);
            if (areaHaResponse && areaHaResponse.data) {
                areaHa = areaHaResponse.data[0].value;
            }
        } else if (geostore) {
            const geostoreResponse = await GeostoreService.getGeostoreByHash(geostore);
            if (geostoreResponse) {
                areaHa = geostoreResponse.areaHa;
            }
        }

        const result = {};
        result.value = numAlerts;
        result.area_ha = areaHa;
        result.period = getPeriodText(period);
        result.downloadUrls = getDownloadUrls(alertQuery, queryParams, datasetIds.all, geostore);
        return result;
    }

    static async latest(limit = 1) {
        logger.debug('Obtaining latest with limit %s', limit);
        const params = {
            limit
        };
        const response = await DatasetService.queryDataset(config.get('datasets.viirs_gadm_all_id'), LATEST, params);
        logger.debug('response', response);
        if (response.data && response.data.length > 0) {
            // for some reason DISTINCT doesn't work for ES, so just returning latest
            const result = response.data[0];
            result.latest = result.date;
            return result;
        }
        return null;
    }

}

module.exports = DatasetService;
