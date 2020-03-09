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

const GIDAREA = `select area_ha FROM {{table}} WHERE gid_{{level}} = '{{gid}}'`;

const ISO = `with p as (SELECT area_ha, ST_makevalid(ST_Simplify(the_geom, {{simplify}})) AS the_geom
           FROM gadm36_countries
           WHERE iso = UPPER('{{iso}}'))
            SELECT COUNT(pt.*) AS value, area_ha
            FROM p
            inner join vnp14imgtdl_nrt_global_7d pt on ST_Intersects(p.the_geom, pt.the_geom)
            and
             (confidence='normal' OR confidence = 'nominal') AND acq_date >= '{{begin}}'::date
             AND acq_date <= '{{end}}'::date
             GROUP BY area_ha`;


const ID1 = `with p as (SELECT area_ha, ST_makevalid(ST_Simplify(the_geom, {{simplify}})) AS the_geom
           FROM gadm36_adm1
           WHERE iso = UPPER('{{iso}}') AND gid_1 = '{{id1}}')
            SELECT COUNT(pt.*) AS value, area_ha
            FROM p
            left join vnp14imgtdl_nrt_global_7d pt on ST_Intersects(p.the_geom, pt.the_geom)
            and
            (confidence='normal' OR confidence = 'nominal') AND acq_date >= '{{begin}}'::date
             AND acq_date <= '{{end}}'::date
             GROUP BY area_ha`;

const ID2 = `with p as (SELECT area_ha, ST_makevalid(ST_Simplify(the_geom, {{simplify}})) AS the_geom
            FROM gadm36_adm2
            WHERE iso = UPPER('{{iso}}') AND gid_1 = '{{id1}}' AND gid_2 = '{{id2}}')
            SELECT COUNT(pt.*) AS value, area_ha
            FROM p
            left join vnp14imgtdl_nrt_global_7d pt on ST_Intersects(p.the_geom, pt.the_geom)
            and
            (confidence='normal' OR confidence = 'nominal') AND acq_date >= '{{begin}}'::date
            AND acq_date <= '{{end}}'::date
            GROUP BY area_ha`;

const USEAREA = `select area_ha FROM {{useTable}} WHERE cartodb_id = {{pid}}`;

const USE = `with p as (SELECT area_ha, the_geom FROM {{useTable}} WHERE cartodb_id = {{pid}})
        SELECT COUNT(pt.*) AS value, p.area_ha
        FROM p
        left join vnp14imgtdl_nrt_global_7d pt on ( ST_Intersects(p.the_geom, pt.the_geom) AND acq_date >= '{{begin}}'
        AND acq_date <= '{{end}}' AND (confidence='normal' OR confidence = 'nominal'))
        GROUP BY p.area_ha
        `;

const WDPAAREA = `select gis_area*100 as area_ha FROM wdpa_protected_areas WHERE wdpaid = {{wdpaid}}`;

const WDPA = `with p as (SELECT CASE when marine::numeric = 2 then null
        WHEN ST_NPoints(the_geom)<=18000 THEN the_geom
        WHEN ST_NPoints(the_geom) BETWEEN 18000 AND 50000 THEN ST_RemoveRepeatedPoints(the_geom, 0.001)
        ELSE ST_RemoveRepeatedPoints(the_geom, 0.005)
        END as the_geom, gis_area*100 as area_ha FROM wdpa_protected_areas where wdpaid={{wdpaid}})
        SELECT COUNT(pt.*) AS value, p.area_ha
        FROM p
        left join vnp14imgtdl_nrt_global_7d pt
                    on ST_Intersects(pt.the_geom, p.the_geom)
                    AND acq_date >= '{{begin}}'
                    AND acq_date <= '{{end}}'
                    AND (confidence='normal' OR confidence = 'nominal')
        GROUP BY area_ha
        `;

const LATEST = `with a AS (SELECT DISTINCT acq_date
        FROM vnp14imgtdl_nrt_global_7d
        WHERE acq_date IS NOT NULL)
        SELECT MAX(acq_date) AS latest FROM a`;


const executeThunk = (client, sql, params) => (callback) => {
    logger.debug(Mustache.render(sql, params));
    client.execute(sql, params).done((data) => {
        callback(null, data);
    }).error((err) => {
        callback(err, null);
    });
};

const routeToGid = (adm0, adm1, adm2) => ({
    adm0,
    adm1: adm1 ? `${adm0}.${adm1}_1` : null,
    adm2: adm2 ? `${adm0}.${adm1}.${adm2}_1` : null
});

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

const getSimplify = (iso) => {
    let thresh = 0.005;
    if (iso) {
        const bigCountries = ['USA', 'RUS', 'CAN', 'CHN', 'BRA', 'IDN'];
        thresh = bigCountries.includes(iso) ? 0.05 : 0.005;
    }
    return thresh;
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
            return period;

    }
};

// eslint-disable-next-line consistent-return
const getDownloadUrls = (query, params) => {
    try {
        const formats = ['csv', 'json', 'kml', 'shp', 'svg'];
        const download = {};
        let queryFinal = Mustache.render(query, params);
        queryFinal = queryFinal.replace('SELECT COUNT(pt.*) AS value', 'SELECT pt.*');
        queryFinal = encodeURIComponent(queryFinal);
        for (let i = 0, { length } = formats; i < length; i++) {
            download[formats[i]] = `${config.get('cartoDB.apiUrl')}?q=${queryFinal}&format=${formats[i]}`;
        }
        return download;
    } catch (err) {
        logger.error(err);
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

class CartoDBServiceV2 {

    constructor() {
        this.client = new CartoDB.SQL({
            user: config.get('cartoDB.user')
        });
    }

    * getAdm0(iso, forSubscription, period = defaultDate(), group = false) {
        logger.debug('Obtaining national of iso %s', iso);
        const gid = routeToGid(iso);
        const simplify = getSimplify(iso);
        const periods = period.split(',');
        const params = {
            iso: gid.adm0,
            begin: periods[0],
            end: periods[1],
            simplify
        };
        let query = ISO;
        if (forSubscription) {
            query = getURLForSubscription(ISO);
        }
        if (group) {
            query = getQueryForGroup(ISO);
        }
        const data = yield executeThunk(this.client, query, params);
        if (forSubscription && data.rows) {
            return data.rows;
        }
        if (group && data.rows) {
            if (data.rows.length > 0 && data.rows[0].day === null) {
                return [];
            }
            return data.rows;
        }
        const result = {};
        result.period = getPeriodText(period);
        result.downloadUrls = getDownloadUrls(ISO, params);
        result.id = params.iso;
        if (data.rows && data.rows.length === 1) {
            result.value = data.rows[0].value;
            result.area_ha = data.rows[0].area_ha;
            return result;
        }
        const area = yield executeThunk(this.client, GIDAREA, {
            table: 'gadm36_countries',
            level: '0',
            gid: params.iso
        });
        if (area.rows && area.rows.length) {
            result.value = null;
            result.area_ha = area.areaHa;
            return result;
        }
        return null;
    }

    * getAdm1(iso, id1, forSubscription, period = defaultDate(), group = false) {
        logger.debug('Obtaining subnational of iso %s and id1', iso, id1);
        const gid = routeToGid(iso, id1);
        const simplify = getSimplify(iso, id1);
        const periods = period.split(',');
        const params = {
            iso: gid.adm0,
            id1: gid.adm1,
            begin: periods[0],
            end: periods[1],
            simplify
        };
        let query = ID1;
        if (forSubscription) {
            query = getURLForSubscription(ID1);
        }
        if (group) {
            query = getQueryForGroup(ID1);
        }
        const data = yield executeThunk(this.client, query, params);
        const result = {};
        result.period = getPeriodText(period);
        result.downloadUrls = getDownloadUrls(ID1, params);
        result.id = params.id1;
        if (data.rows && data.rows.length === 1) {
            result.value = data.rows[0].value;
            result.area_ha = data.rows[0].area_ha;
            return result;
        }
        const area = yield executeThunk(this.client, GIDAREA, { table: 'gadm36_adm1', level: '1', gid: params.id1 });
        if (area.rows && area.rows.length) {
            result.value = null;
            result.area_ha = area.areaHa;
            return result;
        }
        return null;
    }

    * getAdm2(iso, id1, id2, forSubscription, period = defaultDate(), group = false) {
        logger.debug('Obtaining subnational of iso %s and id1', iso, id1);
        const gid = routeToGid(iso, id1, id2);
        const simplify = getSimplify(iso, id1, id2);
        const periods = period.split(',');
        const params = {
            iso: gid.adm0,
            id1: gid.adm1,
            id2: gid.adm2,
            begin: periods[0],
            end: periods[1],
            simplify
        };
        let query = ID2;
        if (forSubscription) {
            query = getURLForSubscription(ID2);
        }
        if (group) {
            query = getQueryForGroup(ID2);
        }
        const data = yield executeThunk(this.client, query, params);
        const result = {};
        result.period = getPeriodText(period);
        result.downloadUrls = getDownloadUrls(ID2, params);
        result.id = params.id2;
        if (data.rows && data.rows.length === 1) {
            result.value = data.rows[0].value;
            result.area_ha = data.rows[0].area_ha;
            return result;
        }
        const area = yield executeThunk(this.client, GIDAREA, { table: 'gadm36_adm2', level: '2', gid: params.id2 });
        if (area.rows && area.rows.length) {
            result.value = 0;
            result.area_ha = area.areaHa;
            return result;
        }
        return null;
    }

    * getUse(useName, id, forSubscription, period = defaultDate(), group = false) {
        logger.debug('Obtaining use with id %s', id);
        const periods = period.split(',');
        const params = {
            useTable: useName,
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
        const data = yield executeThunk(this.client, query, params);
        if (forSubscription && data.rows) {
            return data.rows;
        }
        if (group && data.rows) {
            if (data.rows.length > 0 && data.rows[0].day === null) {
                return [];
            }
            return data.rows;
        }
        if (data.rows && data.rows.length > 0) {
            const result = data.rows[0];
            result.id = id;
            result.period = getPeriodText(period);
            result.downloadUrls = getDownloadUrls(USE, params);
            return result;
        }
        const areas = yield executeThunk(this.client, USEAREA, params);
        if (areas.rows && areas.rows.length > 0) {
            const result = areas.rows[0];
            result.id = id;
            result.value = 0;
            return result;
        }
        const geostore = yield GeostoreService.getGeostoreByUse(useName, id);
        if (geostore) {
            return {
                id,
                value: 0,
                area_ha: geostore.area_ha
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
        const data = yield executeThunk(this.client, query, params);
        if (forSubscription && data.rows) {
            return data.rows;
        }
        if (group && data.rows) {
            if (data.rows.length > 0 && data.rows[0].day === null) {
                return [];
            }
            return data.rows;
        }
        if (data.rows && data.rows.length > 0) {
            const result = data.rows[0];
            result.id = wdpaid;
            result.period = period;
            result.downloadUrls = getDownloadUrls(WDPA, params);
            return result;
        }
        const areas = yield executeThunk(this.client, WDPAAREA, params);
        if (areas.rows && areas.rows.length > 0) {
            const result = areas.rows[0];
            result.id = wdpaid;
            result.value = 0;
            return result;
        }
        const geostore = yield GeostoreService.getGeostoreByWdpa(wdpaid);
        if (geostore) {
            return {
                id: wdpaid,
                value: 0,
                area_ha: geostore.area_ha
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
            downloadUrls: getDownloadUrls(WORLD, params)
        };

        if (data.rows && data.rows.length === 1) {
            result.value = data.rows[0].value || 0;

        }
        return result;
    }

    * latest() {
        logger.debug('Obtaining latest date');
        const data = yield executeThunk(this.client, LATEST);
        if (data && data.rows && data.rows.length) {
            const result = data.rows;
            return result;
        }
        return null;
    }

}

module.exports = new CartoDBServiceV2();
