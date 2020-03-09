const logger = require('logger');
const config = require('config');
const CartoDB = require('cartodb');
const Mustache = require('mustache');
const NotFound = require('errors/notFound');
const GeostoreService = require('services/geostoreService');

const WORLD = `
        SELECT COUNT(pt.*) AS value 
        FROM vnp14imgtdl_nrt_global_7d pt 
        where acq_date >= '{{begin}}'
            AND acq_date <= '{{end}}'
            AND ST_INTERSECTS(ST_SetSRID(ST_GeomFromGeoJSON('{{{geojson}}}'), 4326), the_geom)
            AND (confidence='normal' OR confidence='nominal')
        `;
const AREA = `select ST_Area(ST_SetSRID(ST_GeomFromGeoJSON('{{{geojson}}}'), 4326), TRUE)/10000 as area_ha`;

const ISO = `with p as (SELECT  the_geom
           FROM gadm2_countries_simple
           WHERE iso = UPPER('{{iso}}'))
            SELECT COUNT(pt.*) AS value
            FROM p
            inner join vnp14imgtdl_nrt_global_7d pt on ST_Intersects(p.the_geom, pt.the_geom)
            and
             (confidence='normal' OR confidence = 'nominal') AND acq_date >= '{{begin}}'::date
             AND acq_date <= '{{end}}'::date`;


const ID1 = `with p as (SELECT  the_geom
           FROM gadm28_adm2_geostore
           WHERE iso = UPPER('{{iso}}')  AND id_1 = {{id1}})
            SELECT COUNT(pt.*) AS value
            FROM p
            left join vnp14imgtdl_nrt_global_7d pt on ST_Intersects(p.the_geom, pt.the_geom)
            and
            (confidence='normal' OR confidence = 'nominal') AND acq_date >= '{{begin}}'::date
             AND acq_date <= '{{end}}'::date`;

const ID2 = `with p as (SELECT  the_geom
            FROM gadm2_provinces_simple
            WHERE iso = UPPER('{{iso}}')  AND id_1 = {{id1}} AND id_2 = {{id2}})
            SELECT COUNT(pt.*) AS value
            FROM p
            left join vnp14imgtdl_nrt_global_7d pt on ST_Intersects(p.the_geom, pt.the_geom)
            and
            (confidence='normal' OR confidence = 'nominal') AND acq_date >= '{{begin}}'::date
            AND acq_date <= '{{end}}'::date`;

const USE = `with p as (SELECT the_geom FROM {{useTable}} WHERE cartodb_id = {{pid}})
        SELECT COUNT(pt.*) AS value
        FROM p
        left join vnp14imgtdl_nrt_global_7d pt on ( ST_Intersects(p.the_geom, pt.the_geom) AND acq_date >= '{{begin}}'
        AND acq_date <= '{{end}}' AND (confidence='normal' OR confidence = 'nominal'))
        `;

const WDPA = `with p as (SELECT CASE when marine::numeric = 2 then null
        WHEN ST_NPoints(the_geom)<=18000 THEN the_geom
        WHEN ST_NPoints(the_geom) BETWEEN 18000 AND 50000 THEN ST_RemoveRepeatedPoints(the_geom, 0.001)
        ELSE ST_RemoveRepeatedPoints(the_geom, 0.005)
        END as the_geom FROM wdpa_protected_areas where wdpaid={{wdpaid}})
        SELECT COUNT(pt.*) AS value 
        FROM p
        left join vnp14imgtdl_nrt_global_7d pt
                    on ST_Intersects(pt.the_geom, p.the_geom)
                    AND acq_date >= '{{begin}}'
                    AND acq_date <= '{{end}}'
                    AND (confidence='normal' OR confidence = 'nominal') 
        `;

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


const getToday = () => {
    const today = new Date();
    return `${today.getFullYear().toString()}-${(today.getMonth() + 1).toString()}-${today.getDate().toString()}`;
};

const getYesterday = () => {
    const yesterday = new Date(Date.now() - (24 * 60 * 60 * 1000));
    return `${yesterday.getFullYear().toString()}-${(yesterday.getMonth() + 1).toString()}-${yesterday.getDate().toString()}`;
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

const getURLForSubscription = (query) => {
    const queryFinal = query.replace('SELECT COUNT(pt.*) AS value', 'SELECT pt.*');
    return queryFinal;
};

const getQueryForGroup = (query) => {
    let queryFinal = query.replace('SELECT COUNT(pt.*) AS value', 'SELECT * from ( SELECT date_trunc(\'day\', acq_date) as "day", COUNT(pt.*) AS value');
    queryFinal += ' GROUP BY 1 ) g where g.day is not null';
    return queryFinal;
};


class CartoDBService {

    constructor() {
        this.client = new CartoDB.SQL({
            user: config.get('cartoDB.user')
        });
        this.apiUrl = config.get('cartoDB.apiUrl');
    }

    // eslint-disable-next-line consistent-return
    getDownloadUrls(query, params) {
        try {
            const formats = ['csv', 'geojson', 'kml', 'shp', 'svg'];
            const download = {};
            let queryFinal = Mustache.render(query, params);
            queryFinal = queryFinal.replace('SELECT COUNT(pt.*) AS value', 'SELECT pt.*');
            queryFinal = encodeURIComponent(queryFinal);
            for (let i = 0, { length } = formats; i < length; i++) {
                download[formats[i]] = `${this.apiUrl}?q=${queryFinal}&format=${formats[i]}`;
            }
            return download;
        } catch (err) {
            logger.error(err);
        }
    }

    * getNational(iso, forSubscription, period = defaultDate(), group = false) {
        logger.debug('Obtaining national of iso %s', iso);
        const periods = period.split(',');
        const params = {
            iso,
            begin: periods[0],
            end: periods[1]
        };
        let query = ISO;
        if (forSubscription) {
            query = getURLForSubscription(ISO);
        }
        if (group) {
            query = getQueryForGroup(ISO);
        }
        const geostore = yield GeostoreService.getGeostoreByIso(iso);
        const data = yield executeThunk(this.client, query, params);
        if (geostore) {
            if (forSubscription && data.rows) {
                return data.rows;
            }
            if (group && data.rows) {
                if (data.rows.length > 0 && data.rows[0].day === null) {
                    return [];
                }
                return data.rows;
            }
            if (data.rows && data.rows.length === 1) {
                const result = data.rows[0];
                result.area_ha = geostore.areaHa;
                result.period = getPeriodText(period);
                result.downloadUrls = this.getDownloadUrls(ISO, params);
                return result;
            }
            return {
                area_ha: geostore.areaHa
            };

        }
        return null;
    }

    * getSubnational(iso, id1, forSubscription, period = defaultDate(), group = false) {
        logger.debug('Obtaining subnational of iso %s and id1', iso, id1);
        const periods = period.split(',');
        const params = {
            iso,
            id1,
            begin: periods[0],
            end: periods[1]
        };
        let query = ID1;
        if (forSubscription) {
            query = getURLForSubscription(ID1);
        }
        if (group) {
            query = getQueryForGroup(ID1);
        }
        const geostore = yield GeostoreService.getGeostoreByIsoAndId(iso, id1);
        const data = yield executeThunk(this.client, query, params);

        if (geostore) {
            if (forSubscription && data.rows) {
                return data.rows;
            }
            if (group && data.rows) {
                if (data.rows.length > 0 && data.rows[0].day === null) {
                    return [];
                }
                return data.rows;
            }
            if (data.rows && data.rows.length === 1) {
                const result = data.rows[0];
                result.area_ha = geostore.areaHa;
                result.period = getPeriodText(period);
                result.downloadUrls = this.getDownloadUrls(ID1, params);
                return result;
            }
            return {
                area_ha: geostore.areaHa
            };

        }
        return null;
    }

    * getRegion(iso, id1, id2, forSubscription, period = defaultDate(), group = false) {
        logger.debug('Obtaining subnational of iso %s and id1', iso, id1);
        const periods = period.split(',');
        const params = {
            iso,
            id1,
            begin: periods[0],
            end: periods[1]
        };
        let query = ID2;
        if (forSubscription) {
            query = getURLForSubscription(ID2);
        }
        if (group) {
            query = getQueryForGroup(ID2);
        }
        const geostore = yield GeostoreService.getGeostoreByIsoAndId(iso, id1, id2);
        const data = yield executeThunk(this.client, query, params);
        if (geostore) {
            if (forSubscription && data.rows) {
                return data.rows;
            }
            if (group && data.rows) {
                if (data.rows.length > 0 && data.rows[0].day === null) {
                    return [];
                }
                return data.rows;
            }

            if (data.rows && data.rows.length === 1) {
                const result = data.rows[0];
                result.area_ha = geostore.areaHa;
                result.period = getPeriodText(period);
                result.downloadUrls = this.getDownloadUrls(ID1, params);
                return result;
            }
            return {
                area_ha: geostore.areaHa
            };

        }
        return null;
    }

    * getUse(useName, useTable, id, forSubscription, period = defaultDate(), group = false) {
        logger.debug('Obtaining use with id %s', id);
        const periods = period.split(',');
        const params = {
            useTable,
            pid: id,
            begin: periods[0],
            end: periods[1]
        };
        let query = USE;
        if (forSubscription) {
            query = getURLForSubscription(USE);
        }
        if (group) {
            query = getQueryForGroup(USE);
        }
        const geostore = yield GeostoreService.getGeostoreByUse(useName, id);
        const data = yield executeThunk(this.client, query, params);
        if (geostore) {
            if (forSubscription && data.rows) {
                return data.rows;
            }
            if (group && data.rows) {
                if (data.rows.length > 0 && data.rows[0].day === null) {
                    return [];
                }
                return data.rows;
            }
            if (data.rows && data.rows.length === 1) {
                const result = data.rows[0];
                result.area_ha = geostore.areaHa;
                result.period = getPeriodText(period);
                result.downloadUrls = this.getDownloadUrls(USE, params);
                return result;
            }
            return {
                area_ha: geostore.areaHa
            };

        }
        return null;
    }

    * getWdpa(wdpaid, forSubscription, period = defaultDate(), group = false) {
        logger.debug('Obtaining wpda of id %s', wdpaid);
        const periods = period.split(',');
        const params = {
            wdpaid,
            begin: periods[0],
            end: periods[1]
        };
        let query = WDPA;
        if (forSubscription) {
            query = getURLForSubscription(WDPA);
        }
        if (group) {
            query = getQueryForGroup(WDPA);
        }
        const geostore = yield GeostoreService.getGeostoreByWdpa(wdpaid);

        const data = yield executeThunk(this.client, query, params);
        if (geostore) {
            if (forSubscription && data.rows) {
                return data.rows;
            }
            if (group && data.rows) {
                if (data.rows.length > 0 && data.rows[0].day === null) {
                    return [];
                }
                return data.rows;
            }
            if (data.rows && data.rows.length === 1) {
                const result = data.rows[0];
                result.area_ha = geostore.areaHa;
                result.period = getPeriodText(period);
                result.downloadUrls = this.getDownloadUrls(WDPA, params);
                return result;
            }
            return {
                area_ha: geostore.areaHa
            };

        }
        return null;
    }


    * getWorld(hashGeoStore, forSubscription, period = defaultDate()) {
        logger.debug('Obtaining world with hashGeoStore %s', hashGeoStore);

        const geostore = yield GeostoreService.getGeostoreByHash(hashGeoStore);
        if (geostore && geostore.geojson) {
            return yield this.getWorldWithGeojson(geostore.geojson, forSubscription, period);
        }
        throw new NotFound('Geostore not found');
    }

    // eslint-disable-next-line no-unused-vars
    * getWorldWithGeojson(geojson, forSubscription, period = defaultDate(), group = false) {
        logger.debug('Executing query in cartodb with geojson', geojson);
        const periods = period.split(',');
        const params = {
            geojson: JSON.stringify(geojson.features[0].geometry),
            begin: periods[0],
            end: periods[1]
        };
        let query = WORLD;
        if (forSubscription) {
            query = getURLForSubscription(WORLD);
        }
        if (group) {
            query = getQueryForGroup(WORLD);
        }
        const dataArea = yield executeThunk(this.client, AREA, params);

        logger.debug('Query', query);
        const data = yield executeThunk(this.client, query, params);
        logger.debug('ForSubscription', forSubscription);
        if (forSubscription && data.rows) {

            return data.rows;
        }
        if (group && data.rows) {
            if (data.rows.length > 0 && data.rows[0].day === null) {
                return [];
            }
            return data.rows;
        }
        const result = {
            area_ha: dataArea.rows[0].area_ha,
            period: getPeriodText(period),
            downloadUrls: this.getDownloadUrls(WORLD, params)
        };

        if (data.rows && data.rows.length === 1) {
            result.value = data.rows[0].value || 0;

        }
        return result;
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

module.exports = new CartoDBService();
