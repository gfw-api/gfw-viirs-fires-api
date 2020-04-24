const logger = require('logger');
const config = require('config');
const Mustache = require('mustache');
const GeostoreService = require('services/geostoreService');

const NUM_ALERTS = `SELECT SUM(alert__count) AS value FROM table
    WHERE (confidence__cat = 'h' OR confidence__cat = 'n') 
     AND alert__date >= '{{begin}}'
     AND alert__date <= '{{end}}'`;

const SUMMARY_AREA = `SELECT SUM(area__ha) AS value FROM table`;

const LATEST = `SELECT DISTINCT acq_date as date
        FROM vnp14imgtdl_nrt_global_7d
        WHERE acq_date IS NOT NULL
        ORDER BY date DESC
        LIMIT {{limit}}`;


const executeThunk = function executeThunk(client, sql, params) {
    return (callback) => {
        logger.debug(Mustache.render(sql, params));
        client.execute(sql, params).done((data) => {
            callback(null, data);
        }).error((err) => {
            callback(err, null);
        });
    };
};


const getDateString = (date) => {
    return `${date.getFullYear().toString()}-${('0' + (date.getMonth() + 1).toString()).slice(-2)}-${('0' + date.getDate().toString()).slice(-2)}`;
};

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
const getDownloadUrls = (query, params, datasetId) => {
    try {
        const formats = ['csv', 'geojson'];
        const download = {};
        let queryFinal = Mustache.render(query, params);
        queryFinal = queryFinal.replace('SELECT SUM(alert__count) AS value', 'SELECT *');
        queryFinal = encodeURIComponent(queryFinal);
        for (let i = 0, { length } = formats; i < length; i++) {
            download[formats[i]] = `${config.get('datasets.uri')}/download/${datasetId}?sql=${queryFinal}&format=${formats[i]}`;
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
    let queryFinal = query.replace('SELECT SUM(alert__count) AS value', 'select alert__date as day, sum(alert__count) as value');
    queryFinal += ' GROUP BY alert__date';
    return queryFinal;
};


class DatasetService {
    static* queryDataset(dataset, sql, params = {}, geostore = null) {
        const sqlRendered = Mustache.render(sql, params)
        logger.debug('Running dataset with sql: %s', sqlRendered);
        let uri = `/query/${dataset}?sql=${encodeURIComponent(sqlRendered)}`
        if (geostore) {
            uri += `&geostore=${geostore}`
        }
        const result = yield require('vizz.microservice-client').requestToMicroservice({
            uri,
            method: 'GET',
            json: true
        });
        if (result.statusCode !== 200) {
            logger.error('Error running query:');
            logger.error(result);
            return null;
        }
        logger.debug(`Le real response: ${JSON.stringify(result.body)}`)
        return yield result.body;
    }

    * getAdm(iso, forSubscription, period = defaultDate(), group = false, adm1 = null, adm2 = null) {
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
        areaQuery += ` AND iso = '{{iso}}'`;

        if (adm1) {
            params.adm1 = adm1;
            alertQuery += ` AND adm1 = '{{adm1}}'`;
            areaQuery += ` AND adm1 = '{{adm1}}'`;

            if (adm2) {
                params.adm2 = adm2
                alertQuery += ` AND adm1 = '{{adm2}}'`
                areaQuery += ` AND adm2 = '{{adm2}}'`;
            }
        }

        logger.debug(`forSubscription: ${forSubscription} `)
        if (forSubscription) {
            logger.debug(`hurrr`)
            alertQuery = getURLForSubscription(alertQuery);
            const result = yield DatasetService.queryDataset(config.get('datasets.viirs_gadm_all_id'), alertQuery, params);
            return result.data;
        }
        if (group) {
            alertQuery = getQueryForGroup(alertQuery);
            const result = yield DatasetService.queryDataset(config.get('datasets.viirs_gadm_daily_id'), alertQuery, params);
            return result.data;
        }

        const numAlertsResponse = yield DatasetService.queryDataset(config.get('datasets.viirs_gadm_daily_id'), alertQuery, params);
        let numAlerts = 0;
        if (numAlertsResponse && numAlertsResponse.data) {
            numAlerts = numAlertsResponse.data[0].value;
        }

        const areaHaResponse = yield DatasetService.queryDataset(config.get('datasets.gadm_summary_id'), areaQuery, params);
        let areaHa = 0;
        if (areaHaResponse && areaHaResponse.data) {
            areaHa = areaHaResponse.data[0].value;
        }

        const result = {};
        result.value = numAlerts;
        result.area_ha = areaHa;
        result.period = getPeriodText(period);
        result.downloadUrls = getDownloadUrls(alertQuery, params, config.get('datasets.viirs_gadm_all_id'));
        return result;
    }

    * getUse(useName, useTable, id, forSubscription, period = defaultDate(), group = false) {
        logger.debug('Obtaining use with id %s', id);

        // no special table for use, so just get geostore hash and do query on all points with geostore filter
        const geostore = yield GeostoreService.getGeostoreByUse(useName, id);
        if (geostore) {
            return yield this.getWorld(geostore.data.id, forSubscription, period, group)
        }
        return null;
    }

    * getWdpa(wdpa_id, forSubscription, period = defaultDate(), group = false) {
        logger.debug('Obtaining wpda of id %s', wdpaid);
        const periods = period.split(',');
        const params = {
            wdpa_id,
            begin: periods[0],
            end: periods[1]
        };

        let alertQuery = NUM_ALERTS;
        let areaQuery = SUMMARY_AREA;

        alertQuery += ` AND wdpa__id = '{{wdpa_id}}'`;
        areaQuery += ` AND wdpa__id = '{{iso}}'`;

        if (forSubscription) {
            alertQuery = getURLForSubscription(alertQuery);
            return DatasetService.queryDataset(ALL_POINTS_WDPA_VIIRS_DATASET_ID, alertQuery, params);
        }
        if (group) {
            alertQuery = getQueryForGroup(alertQuery);
            return DatasetService.queryDataset(WDPA_VIIRS_DAILY_DATASET_ID, alertQuery, params);
        }

        const numAlertsResponse = yield DatasetService.queryDataset(config.get('datasets.viirs_gadm_daily_id'), alertQuery, params);
        let numAlerts = 0;
        if (numAlertsResponse && numAlertsResponse.data) {
            numAlerts = numAlertsResponse.data[0].value;
        }

        const areaHaResponse = yield DatasetService.queryDataset(config.get('datasets.gadm_summary_id'), areaQuery, params);
        let areaHa = 0;
        if (areaHaResponse && areaHaResponse.data) {
            areaHa = areaHaResponse.data[0].value;
        }
        const result = {};
        result.value = numAlerts;
        result.area_ha = areaHa;
        result.period = getPeriodText(period);
        result.downloadUrls = getDownloadUrls(alertQuery, params, ALL_POINTS_VIIRS_DATASET_ID);
        return result;
    }


    * getWorld(hashGeoStore, forSubscription, period = defaultDate(), group = false) {
        logger.debug('Obtaining world with hashGeoStore %s', hashGeoStore);
        const periods = period.split(',');
        const params = {
            geojson: JSON.stringify(geojson.features[0].geometry),
            begin: periods[0],
            end: periods[1]
        };
        let alertQuery = NUM_ALERTS;
        alertQuery += ` AND wdpa__id = '{{wdpa_id}}'`;

        if (forSubscription) {
            alertQuery = getURLForSubscription(alertQuery);
            return queryDataset(ALL_POINTS_WDPA_VIIRS_DATASET_ID, alertQuery, params, hashGeoStore);
        }
        if (group) {
            alertQuery = getQueryForGroup(alertQuery);
            return DatasetService.queryDataset(ALL_POINTS_WDPA_VIIRS_DATASET_ID, alertQuery, params, hashGeoStore);
        }

        const numAlerts = yield DatasetService.queryDataset(ALL_POINTS_WDPA_VIIRS_DATASET_ID, alertQuery, params, hashGeoStore);
        const geostore = yield GeostoreService.getGeostoreByHash(hashGeoStore);
        let areaHa = null
        if (geostore && geostore.geojson) {
            areaHa = geostore.geojson.areaHa
        }

        const result = {};
        result.value = numAlerts;
        result.area_ha = areaHa;
        result.period = getPeriodText(period);
        result.downloadUrls = getDownloadUrls(alertQuery, params, ALL_POINTS_VIIRS_DATASET_ID, hashGeoStore);
        return result;
    }

    // eslint-disable-next-line no-unused-vars
    * getWorldWithGeojson(geojson, forSubscription, period = defaultDate(), group = false) {
        logger.debug('Executing query with geojson', geojson);
        const geostoreHash = yield GeostoreService.createGeostore(geojson)
        return yield this.getWorld(geostoreHash, forSubscription, period, group)
    }

    * latest(limit = 3) {
        logger.debug('Obtaining latest with limit %s', limit);
        const params = {
            limit
        };
        const data = yield executeThunk(this.client, LATEST, params);
        logger.debug('data', data);
        if (data.rows) {
            const result = data.rows;
            return result;
        }
        return null;
    }

}

module.exports = new DatasetService();
