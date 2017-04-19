'use strict';
var logger = require('logger');
var path = require('path');
var config = require('config');
var CartoDB = require('cartodb');
var Mustache = require('mustache');
var NotFound = require('errors/notFound');
var JSONAPIDeserializer = require('jsonapi-serializer').Deserializer;

const WORLD = `SELECT COUNT(pt.*) AS value, ST_Area(ST_SetSRID(ST_GeomFromGeoJSON('{{{geojson}}}'), 4326), TRUE)/10000 as area_ha 
        FROM vnp14imgtdl_nrt_global_7d pt
        WHERE acq_date >= '{{begin}}'
            AND acq_date <= '{{end}}'
            AND ST_INTERSECTS(
                ST_SetSRID(ST_GeomFromGeoJSON('{{{geojson}}}'), 4326), the_geom)
            AND confidence='nominal' group by area_ha`;

const ISO = `with p as (SELECT  the_geom, (ST_Area(geography(the_geom))/10000) as area_ha
           FROM gadm2_countries_simple
           WHERE iso = UPPER('{{iso}}'))
            SELECT COUNT(pt.*) AS value,  p.area_ha
            FROM p
            left join vnp14imgtdl_nrt_global_7d pt on ST_Intersects(p.the_geom, pt.the_geom)
            and
             confidence='nominal' AND acq_date >= '{{begin}}'::date
             AND acq_date <= '{{end}}'::date
            group by p.area_ha`;


const ID1 = `with p as (SELECT  the_geom, (ST_Area(geography(the_geom))/10000) as area_ha
           FROM gadm2_provinces_simple
           WHERE iso = UPPER('{{iso}}')  AND id_1 = {{id1}})
            SELECT COUNT(pt.*) AS value,  p.area_ha
            FROM p
            left join vnp14imgtdl_nrt_global_7d pt on ST_Intersects(p.the_geom, pt.the_geom)
            and
             confidence='nominal' AND acq_date >= '{{begin}}'::date
             AND acq_date <= '{{end}}'::date
            group by p.area_ha`;


const USE = `with p as (SELECT the_geom,     area_ha::numeric FROM {{useTable}} WHERE cartodb_id = {{pid}})
        SELECT COUNT(pt.*) AS value,  p.area_ha
        FROM p
        left join vnp14imgtdl_nrt_global_7d pt on ( ST_Intersects(p.the_geom, pt.the_geom) AND acq_date >= '{{begin}}'
        AND acq_date <= '{{end}}' AND confidence='nominal')
        group by p.area_ha`;

const WDPA = `with p as (SELECT CASE when marine::numeric = 2 then null
        WHEN ST_NPoints(the_geom)<=18000 THEN the_geom
        WHEN ST_NPoints(the_geom) BETWEEN 18000 AND 50000 THEN ST_RemoveRepeatedPoints(the_geom, 0.001)
        ELSE ST_RemoveRepeatedPoints(the_geom, 0.005)
        END as the_geom, rep_area*100 as area_ha FROM wdpa_protected_areas where wdpaid={{wdpaid}})
        SELECT COUNT(pt.*) AS value , area_ha
        FROM p
        left join vnp14imgtdl_nrt_global_7d pt
                    on ST_Intersects(pt.the_geom, p.the_geom)
                    AND acq_date >= '{{begin}}'
                    AND acq_date <= '{{end}}'
                    AND confidence='nominal'
        group by p.area_ha`;

const LATEST = `SELECT DISTINCT acq_date as date
        FROM vnp14imgtdl_nrt_global_7d
        WHERE acq_date IS NOT NULL
        ORDER BY date DESC
        LIMIT {{limit}}`;


var executeThunk = function(client, sql, params) {
    return function(callback) {
        logger.debug(Mustache.render(sql, params));
        client.execute(sql, params).done(function(data) {
            callback(null, data);
        }).error(function(err) {
            callback(err, null);
        });
    };
};

var deserializer = function(obj) {
    return function(callback) {
        new JSONAPIDeserializer({keyForAttribute: 'camelCase'}).deserialize(obj, callback);
    };
};


let getToday = function() {
    let today = new Date();
    return `${today.getFullYear().toString()}-${(today.getMonth()+1).toString()}-${today.getDate().toString()}`;
};

let getYesterday = function() {
    let yesterday = new Date(Date.now() - (24 * 60 * 60 * 1000));
    return `${yesterday.getFullYear().toString()}-${(yesterday.getMonth()+1).toString()}-${yesterday.getDate().toString()}`;
};


let defaultDate = function() {
    let to = getToday();
    let from = getYesterday();
    return from + ',' + to;
};

class CartoDBService {

    constructor() {
        this.client = new CartoDB.SQL({
            user: config.get('cartoDB.user')
        });
        this.apiUrl = config.get('cartoDB.apiUrl');
    }

    getPeriodText(period) {
        let periods = period.split(',');
        let days = (new Date(periods[1]) - new Date(periods[0])) / (24 * 60 * 60 * 1000);

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

    getDownloadUrls(query, params) {
        try {
            let formats = ['csv', 'geojson', 'kml', 'shp', 'svg'];
            let download = {};
            let queryFinal = Mustache.render(query, params);
            queryFinal = queryFinal.replace('SELECT COUNT(pt.*) AS value', 'SELECT pt.*');
            queryFinal = queryFinal.replace('group by p.area_ha', '');
            queryFinal = encodeURIComponent(queryFinal);
            for (let i = 0, length = formats.length; i < length; i++) {
                download[formats[i]] = this.apiUrl + '?q=' + queryFinal + '&format=' + formats[i];
            }
            return download;
        } catch (err) {
            logger.error(err);
        }
    }

    getURLForSubscrition(query) {
        let queryFinal = query.replace('SELECT COUNT(pt.*) AS value', 'SELECT pt.*');
        queryFinal = queryFinal.replace('group by p.area_ha', '');
        return queryFinal;
    }

    * getNational(iso, forSubscription, period = defaultDate()) {
        logger.debug('Obtaining national of iso %s', iso);
        let periods = period.split(',');
        var params = {
            iso: iso,
            begin: periods[0],
            end: periods[1]
        };
        let query = ISO;
        if(forSubscription){
            query = this.getURLForSubscrition(ISO);
        }
        let data = yield executeThunk(this.client, query, params);
        if (data.rows && data.rows.length === 1) {
            let result = data.rows[0];
            result.period = this.getPeriodText(period);
            result.downloadUrls = this.getDownloadUrls(ISO, params);
            return result;
        } else {
            return data.rows;
        }
        return null;
    }

    * getSubnational(iso, id1, forSubscription, period = defaultDate()) {
        logger.debug('Obtaining subnational of iso %s and id1', iso, id1);
        let periods = period.split(',');
        let params = {
            iso: iso,
            id1: id1,
            begin: periods[0],
            end: periods[1]
        };
        let query = ID1;
        if(forSubscription){
            query = this.getURLForSubscrition(ID1);
        }
        let data = yield executeThunk(this.client, query, params);
        if (data.rows && data.rows.length === 1) {
            let result = data.rows[0];
            result.period = this.getPeriodText(period);
            result.downloadUrls = this.getDownloadUrls(ID1, params);
            return result;
        } else {
            return data.rows;
        }
        return null;
    }

    * getUse(useTable, id, forSubscription, period = defaultDate()) {
        logger.debug('Obtaining use with id %s', id);
        let periods = period.split(',');
        let params = {
            useTable: useTable,
            pid: id,
            begin: periods[0],
            end: periods[1]
        };
        let query = USE;
        if(forSubscription){
            query = this.getURLForSubscrition(USE);
        }
        let data = yield executeThunk(this.client, query, params);

        if (data.rows && data.rows.length === 1) {
            let result = data.rows[0];
            result.period = this.getPeriodText(period);
            result.downloadUrls = this.getDownloadUrls(USE, params);
            return result;
        } else {
            return data.rows;
        }
        return null;
    }

    * getWdpa(wdpaid, forSubscription, period = defaultDate()) {
        logger.debug('Obtaining wpda of id %s', wdpaid);
        let periods = period.split(',');
        let params = {
            wdpaid: wdpaid,
            begin: periods[0],
            end: periods[1]
        };
        let query = WDPA;
        if(forSubscription){
            query = this.getURLForSubscrition(WDPA);
        }
        let data = yield executeThunk(this.client, query, params);
        if (data.rows && data.rows.length === 1) {
            let result = data.rows[0];
            result.period = this.getPeriodText(period);
            result.downloadUrls = this.getDownloadUrls(WDPA, params);
            return result;
        } else {
            return data.rows;
        }
        return null;
    }

    * getGeostore(hashGeoStore) {
        logger.debug('Obtaining geostore with hash %s', hashGeoStore);
        let result = yield require('vizz.microservice-client').requestToMicroservice({
            uri: '/geostore/' + hashGeoStore,
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

    * getWorld(hashGeoStore, forSubscription, period = defaultDate()) {
        logger.debug('Obtaining world with hashGeoStore %s', hashGeoStore);

        let geostore = yield this.getGeostore(hashGeoStore);
        if (geostore && geostore.geojson) {
            return this.getWorldWithGeojson(geostore.geojson, forSubscription, period);
        }
        throw new NotFound('Geostore not found');
    }

    * getWorldWithGeojson(geojson, forSubscription, period = defaultDate()) {
        logger.debug('Executing query in cartodb with geojson', geojson);
        let periods = period.split(',');
        let params = {
            geojson: JSON.stringify(geojson.features[0].geometry),
            begin: periods[0],
            end: periods[1]
        };
        let query = WORLD;
        if(forSubscription){
            query = this.getURLForSubscrition(WORLD);
        }
        let data = yield executeThunk(this.client, query, params);
        if (data.rows && data.rows.length === 1) {
            let result = data.rows[0];
            if(data.rows.length > 0){
                result.area_ha = data.rows[0].area_ha;
            }
            result.period = this.getPeriodText(period);
            result.downloadUrls = this.getDownloadUrls(WORLD, params);
            return result;
        } else {
            return data.rows;
        }
        return null;
    }

    * latest(limit = 3) {
        logger.debug('Obtaining latest with limit %s', limit);
        let params = {
            limit: limit
        };
        let data = yield executeThunk(this.client, LATEST, params);
        logger.debug('data', data);
        if (data.rows) {
            let result = data.rows;
            return result;
        }
        return null;
    }

}

module.exports = new CartoDBService();
