/* eslint-disable no-unused-vars,no-undef */
const nock = require('nock');
const chai = require('chai');
const config = require('config');
const axios = require('axios');
const logger = require('logger');
const { getTestServer } = require('../utils/test-server');
const { CORRECT_CAMERRON_SQL_RESULT } = require('../utils/cameroon-mock');
const { LIBERIA_ALERT_COUNT, LIBERIA_AREA, LIBERIA_SUBSCRIPTION_POINTS } = require('../utils/query-mocks');

chai.use(require('chai-datetime'));

chai.should();

let requester;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('V1 - Get active fires tests', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestServer();
    });

    it('Get correct downloadUrls (200) links when when querying for admin level data', async () => {
        const lbrAlertQuery = `SELECT%20SUM(alert__count)%20AS%20value%20FROM%20table%0A%20%20%20%20WHERE%20(confidence__cat%20%3D%20%27h%27%20OR%20confidence__cat%20%3D%20%27n%27)%20%0A%20%20%20%20%20AND%20alert__date%20%3E%3D%20%272020-04-22%27%0A%20%20%20%20%20AND%20alert__date%20%3C%3D%20%272020-04-23%27%20AND%20iso%20%3D%20%27LBR%27`;
        const baseAreaQuery = `SELECT SUM(area__ha) AS value FROM table`;

        // const liberiaAlertQuery = baseAlertQuery + " AND iso = 'LBR'";
        logger.debug(`Le response: ${JSON.stringify(LIBERIA_ALERT_COUNT)}`)
        nock(process.env.CT_URL, { encodedQueryParams: true })
            .get(`/v1/query/${config.get('datasets.viirs_gadm_daily_id')}`)
            .query({ sql: lbrAlertQuery })
            .reply(200, LIBERIA_ALERT_COUNT);

        const liberiaAreaQuery = `${baseAreaQuery} AND iso = 'LBR'`;
        nock(process.env.CT_URL)
            .get(`/v1/query/${config.get('datasets.gadm_summary_id')}?sql=${escape(liberiaAreaQuery)}`)
            .reply(200, LIBERIA_AREA);

        // mock download urls
        const downloadSql = `SELECT%20*%20FROM%20table%0A%20%20%20%20WHERE%20(confidence__cat%20%3D%20'h'%20OR%20confidence__cat%20%3D%20'n')%20%0A%20%20%20%20%20AND%20alert__date%20%3E%3D%20'2020-04-22'%0A%20%20%20%20%20AND%20alert__date%20%3C%3D%20'2020-04-23'%20AND%20iso%20%3D%20'LBR'`;
        nock(config.get('datasets.uri'), { encodedQueryParams: true })
            .get(`/download/${config.get('datasets.viirs_gadm_all_id')}`)
            .query({
                sql: downloadSql,
                format: 'csv'
            })
            .reply(200);

        nock(config.get('datasets.uri'), { encodedQueryParams: true })
            .get(`/download/${config.get('datasets.viirs_gadm_all_id')}`)
            .query({
                sql: downloadSql,
                format: 'geojson'
            })
            .reply(200);

        const response = await requester.get(`/api/v1/viirs-active-fires/admin/LBR?period=2020-04-22%2C2020-04-23`);

        logger.debug('Response: %s', JSON.stringify(response.body))
        const { downloadUrls } = response.body.data.attributes;

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('object');
        response.body.data.attributes.should.have.property('downloadUrls').and.be.an('object');
        downloadUrls.should.have.property('csv');
        downloadUrls.should.have.property('geojson');

        try {
            const csvDownloadUrl = await axios.get(downloadUrls.csv);
            csvDownloadUrl.status.should.equal(200);

            const jsonDownloadUrl = await axios.get(downloadUrls.geojson);
            jsonDownloadUrl.status.should.equal(200);

        } catch (error) {
            throw new Error('Something awful happened', error);
        }
    });

    // test adm forSubscription
    it('Get subscription response for admin level data', async () => {
        // eslint-disable-next-line max-len
        const lbrAlertQuery = `SELECT%20latitude%2C%20longitude%2C%20alert__date%20as%20acq_date%2C%20alert__time_utc%20as%20acq_time%20FROM%20table%0A%20%20%20%20WHERE%20(confidence__cat%20%3D%20%27h%27%20OR%20confidence__cat%20%3D%20%27n%27)%20%0A%20%20%20%20%20AND%20alert__date%20%3E%3D%20%272020-04-22%27%0A%20%20%20%20%20AND%20alert__date%20%3C%3D%20%272020-04-23%27%20AND%20iso%20%3D%20%27LBR%27`;

        // const liberiaAlertQuery = baseAlertQuery + " AND iso = 'LBR'";
        // logger.debug(`Le response: ${JSON.stringify(LIBERIA_ALL_POINTS)}`)
        nock(process.env.CT_URL, { encodedQueryParams: true })
            .get(`/v1/query/${config.get('datasets.viirs_gadm_all_id')}`)
            .query({ sql: lbrAlertQuery })
            .reply(200, LIBERIA_SUBSCRIPTION_POINTS);

        const response = await requester.get(`/api/v1/viirs-active-fires/admin/LBR?period=2020-04-22%2C2020-04-23&forSubscription=true`);

        logger.debug('Response: %s', JSON.stringify(response.body));
        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array');
        response.body.data.length.should.equal(LIBERIA_SUBSCRIPTION_POINTS.data.length);

        const dataItem = response.body.data[0];
        dataItem.should.have.property('attributes').and.be.an('object');
        dataItem.attributes.should.have.property('latitude');
    });

    // test adm group
    it('Group response for admin level data', async () => {
        // eslint-disable-next-line max-len
        const lbrAlertQuery = `SELECT%20latitude%2C%20longitude%2C%20alert__date%20as%20acq_date%2C%20alert__time_utc%20as%20acq_time%20FROM%20table%0A%20%20%20%20WHERE%20(confidence__cat%20%3D%20%27h%27%20OR%20confidence__cat%20%3D%20%27n%27)%20%0A%20%20%20%20%20AND%20alert__date%20%3E%3D%20%272020-04-22%27%0A%20%20%20%20%20AND%20alert__date%20%3C%3D%20%272020-04-23%27%20AND%20iso%20%3D%20%27LBR%27`;

        // const liberiaAlertQuery = baseAlertQuery + " AND iso = 'LBR'";
        // logger.debug(`Le response: ${JSON.stringify(LIBERIA_ALL_POINTS)}`)
        nock(process.env.CT_URL, { encodedQueryParams: true })
            .get(`/v1/query/${config.get('datasets.viirs_gadm_all_id')}`)
            .query({ sql: lbrAlertQuery })
            .reply(200, LIBERIA_SUBSCRIPTION_POINTS);

        const response = await requester.get(`/api/v1/viirs-active-fires/admin/LBR?period=2020-04-22%2C2020-04-23&forSubscription=true`);

        logger.debug('Response: %s', JSON.stringify(response.body));
        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array');
        response.body.data.length.should.equal(LIBERIA_SUBSCRIPTION_POINTS.data.length);

        const dataItem = response.body.data[0];
        dataItem.should.have.property('attributes').and.be.an('object');
        dataItem.attributes.should.have.property('latitude');
    });
    // test wdpa
    // test world with geostore
    // test world with geojson

    afterEach(async () => {
        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
