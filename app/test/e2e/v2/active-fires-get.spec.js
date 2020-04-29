/* eslint-disable no-unused-vars,no-undef */
const nock = require('nock');
const chai = require('chai');
const config = require('config');
const axios = require('axios');
const logger = require('logger');
const { getTestServer } = require('../utils/test-server');
const {
    ALERT_COUNT_RESPONSE, AREA_RESPONSE, LIBERIA_SUBSCRIPTION_POINTS, LIBERIA_GROUPED, GEOSTORE_RESPONSE, LATEST_RESPONSE
} = require('../utils/query-mocks');

chai.use(require('chai-datetime'));

chai.should();

let requester;

nock.disableNetConnect();
nock.enableNetConnect(process.env.HOST_IP);

describe('V2 - Get active fires tests', () => {

    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }

        requester = await getTestServer();
    });

    it('V2 Get correct downloadUrls (200) links when when querying for admin level data', async () => {
        const alertQuery = `SELECT%20SUM(alert__count)%20AS%20value%20FROM%20table%0A%20%20%20%20WHERE%20(confidence__cat%20%3D%20%27h%27%20OR%20confidence__cat%20%3D%20%27n%27)%20%0A%20%20%20%20%20AND%20alert__date%20%3E%3D%20%272020-04-22%27%0A%20%20%20%20%20AND%20alert__date%20%3C%3D%20%272020-04-23%27%20AND%20iso%20%3D%20%27LBR%27`;
        const areaQuery = `SELECT%20SUM(area__ha)%20AS%20value%20FROM%20table%20WHERE%20iso%20%3D%20%27LBR%27`;

        nock(process.env.CT_URL, { encodedQueryParams: true })
            .get(`/v1/query/${config.get('datasets.viirs_gadm_daily_id')}`)
            .query({ sql: alertQuery })
            .reply(200, ALERT_COUNT_RESPONSE);

        nock(process.env.CT_URL, { encodedQueryParams: true })
            .get(`/v1/query/${config.get('datasets.gadm_summary_id')}`)
            .query({ sql: areaQuery })
            .reply(200, AREA_RESPONSE);

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
                format: 'json'
            })
            .reply(200);

        const response = await requester.get(`/api/v2/viirs-active-fires/admin/LBR?period=2020-04-22%2C2020-04-23`);

        logger.debug('Response: %s', JSON.stringify(response.body));
        const { downloadUrls } = response.body.data.attributes;

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('object');
        response.body.data.attributes.should.have.property('downloadUrls').and.be.an('object');
        response.body.data.attributes.value.should.equal(2415);
        response.body.data.attributes.areaHa.should.equal(11.137);
        downloadUrls.should.have.property('csv');
        downloadUrls.should.have.property('json');

        try {
            const csvDownloadUrl = await axios.get(downloadUrls.csv);
            csvDownloadUrl.status.should.equal(200);

            const jsonDownloadUrl = await axios.get(downloadUrls.json);
            jsonDownloadUrl.status.should.equal(200);

        } catch (error) {
            throw new Error('Something awful happened', error);
        }
    });

    // test adm forSubscription
    it('V2 Get subscription response for admin level data', async () => {
        // eslint-disable-next-line max-len
        const lbrAlertQuery = `SELECT%20latitude%2C%20longitude%2C%20alert__date%20as%20acq_date%2C%20alert__time_utc%20as%20acq_time%20FROM%20table%0A%20%20%20%20WHERE%20(confidence__cat%20%3D%20%27h%27%20OR%20confidence__cat%20%3D%20%27n%27)%20%0A%20%20%20%20%20AND%20alert__date%20%3E%3D%20%272020-04-22%27%0A%20%20%20%20%20AND%20alert__date%20%3C%3D%20%272020-04-23%27%20AND%20iso%20%3D%20%27LBR%27`;

        nock(process.env.CT_URL, { encodedQueryParams: true })
            .get(`/v1/query/${config.get('datasets.viirs_gadm_all_id')}`)
            .query({ sql: lbrAlertQuery })
            .reply(200, LIBERIA_SUBSCRIPTION_POINTS);

        const response = await requester.get(`/api/v2/viirs-active-fires/admin/LBR?period=2020-04-22%2C2020-04-23&forSubscription=true`);

        logger.debug('Response: %s', JSON.stringify(response.body));
        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array');
        response.body.data.length.should.equal(LIBERIA_SUBSCRIPTION_POINTS.data.length);

        const dataItem = response.body.data[0];
        dataItem.should.have.property('attributes').and.be.an('object');
        dataItem.attributes.should.have.property('latitude');
    });

    // test adm group
    it('V2 Get group response for admin level data', async () => {
        // eslint-disable-next-line max-len
        const lbrAlertQuery = `SELECT%20alert__date%20as%20day%2C%20SUM(alert__count)%20as%20value%20FROM%20table%0A%20%20%20%20WHERE%20(confidence__cat%20%3D%20%27h%27%20OR%20confidence__cat%20%3D%20%27n%27)%20%0A%20%20%20%20%20AND%20alert__date%20%3E%3D%20%272020-04-22%27%0A%20%20%20%20%20AND%20alert__date%20%3C%3D%20%272020-04-23%27%20AND%20iso%20%3D%20%27LBR%27%20GROUP%20BY%20alert__date`;

        nock(process.env.CT_URL, { encodedQueryParams: true })
            .get(`/v1/query/${config.get('datasets.viirs_gadm_daily_id')}`)
            .query({ sql: lbrAlertQuery })
            .reply(200, LIBERIA_GROUPED);

        const response = await requester.get(`/api/v2/viirs-active-fires/admin/LBR?period=2020-04-22%2C2020-04-23&group=true`);

        logger.debug('Response: %s', JSON.stringify(response.body));
        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('array');
        response.body.data.length.should.equal(LIBERIA_GROUPED.data.length);

        const dataItem = response.body.data[0];
        dataItem.should.have.property('attributes').and.be.an('object');
        dataItem.attributes.should.have.property('day');
    });

    // test wdpa
    it('V2 Get response for wdpa data', async () => {
        // eslint-disable-next-line max-len
        const alertQuery = `SELECT%20SUM(alert__count)%20AS%20value%20FROM%20table%0A%20%20%20%20WHERE%20(confidence__cat%20%3D%20%27h%27%20OR%20confidence__cat%20%3D%20%27n%27)%20%0A%20%20%20%20%20AND%20alert__date%20%3E%3D%20%272020-04-22%27%0A%20%20%20%20%20AND%20alert__date%20%3C%3D%20%272020-04-23%27%20AND%20wdpa_protected_area__id%20%3D%20%2710%27`;
        const areaQuery = `SELECT%20SUM(area__ha)%20AS%20value%20FROM%20table%20WHERE%20wdpa_protected_area__id%20%3D%20%2710%27`;

        nock(process.env.CT_URL, { encodedQueryParams: true })
            .get(`/v1/query/${config.get('datasets.viirs_wdpa_daily_id')}`)
            .query({ sql: alertQuery })
            .reply(200, ALERT_COUNT_RESPONSE);

        nock(process.env.CT_URL, { encodedQueryParams: true })
            .get(`/v1/query/${config.get('datasets.wdpa_summary_id')}`)
            .query({ sql: areaQuery })
            .reply(200, AREA_RESPONSE);

        const response = await requester.get(`/api/v2/viirs-active-fires/wdpa/10?period=2020-04-22%2C2020-04-23`);

        logger.debug('Response: %s', JSON.stringify(response.body));
        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('object');
        response.body.data.attributes.value.should.equal(2415);
        response.body.data.attributes.areaHa.should.equal(11.137);
    });

    // test world with geostore
    it('V2 Get response for geostore data', async () => {
        // eslint-disable-next-line max-len
        const alertQuery = `SELECT%20SUM(alert__count)%20AS%20value%20FROM%20table%0A%20%20%20%20WHERE%20(confidence__cat%20%3D%20%27h%27%20OR%20confidence__cat%20%3D%20%27n%27)%20%0A%20%20%20%20%20AND%20alert__date%20%3E%3D%20%272020-04-22%27%0A%20%20%20%20%20AND%20alert__date%20%3C%3D%20%272020-04-23%27`;

        nock(process.env.CT_URL, { encodedQueryParams: true })
            .get(`/v1/query/${config.get('datasets.viirs_gadm_all_id')}`)
            .query({
                sql: alertQuery,
                geostore: '351cfa10a38f86eeacad8a86ab7ce845'
            })
            .reply(200, ALERT_COUNT_RESPONSE);

        nock(process.env.CT_URL, { encodedQueryParams: true })
            .get(`/v1/geostore/351cfa10a38f86eeacad8a86ab7ce845`)
            .reply(200, GEOSTORE_RESPONSE);

        const response = await requester.get(`/api/v2/viirs-active-fires?geostore=351cfa10a38f86eeacad8a86ab7ce845&period=2020-04-22%2C2020-04-23`);

        logger.debug('Response: %s', JSON.stringify(response.body));
        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('object');
        response.body.data.attributes.value.should.equal(2415);
        response.body.data.attributes.areaHa.should.equal(394733.6044288499);
    });

    // test world with geojson
    it('V2 Get response for POST geojson', async () => {
        // eslint-disable-next-line max-len
        const alertQuery = `SELECT%20SUM(alert__count)%20AS%20value%20FROM%20table%0A%20%20%20%20WHERE%20(confidence__cat%20%3D%20%27h%27%20OR%20confidence__cat%20%3D%20%27n%27)%20%0A%20%20%20%20%20AND%20alert__date%20%3E%3D%20%272020-04-22%27%0A%20%20%20%20%20AND%20alert__date%20%3C%3D%20%272020-04-23%27`;

        nock(process.env.CT_URL)
            .post(`/v1/geostore`)
            .reply(200, GEOSTORE_RESPONSE);

        nock(process.env.CT_URL, { encodedQueryParams: true })
            .get(`/v1/query/${config.get('datasets.viirs_gadm_all_id')}`)
            .query({
                sql: alertQuery,
                geostore: '351cfa10a38f86eeacad8a86ab7ce845'
            })
            .reply(200, ALERT_COUNT_RESPONSE);

        nock(process.env.CT_URL)
            .get(`/v1/geostore/351cfa10a38f86eeacad8a86ab7ce845`)
            .reply(200, GEOSTORE_RESPONSE);

        const response = await requester.post(`/api/v2/viirs-active-fires?period=2020-04-22%2C2020-04-23`).send({
            geojson: {
                type: 'Polygon',
                coordinates: [
                    [
                        [
                            112.371093750044,
                            -1.71406936894705
                        ],
                        [
                            112.54687500004,
                            -2.35087223984772
                        ],
                        [
                            113.475219726588,
                            -2.08739834101191
                        ],
                        [
                            112.371093750044,
                            -1.71406936894705
                        ]
                    ]
                ]
            }
        });

        logger.debug('Response: %s', JSON.stringify(response.body));
        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('object');
        response.body.data.attributes.value.should.equal(2415);
        response.body.data.attributes.areaHa.should.equal(394733.6044288499);
    });

    // test latest
    it('V2 Get response from latest', async () => {
        // eslint-disable-next-line max-len
        const latestQuery = `SELECT%20alert__date%20as%20date%0A%20%20%20%20%20%20%20%20FROM%20table%20ORDER%20BY%20alert__date%20DESC%0A%20%20%20%20%20%20%20%20LIMIT%201`;

        nock(process.env.CT_URL, { encodedQueryParams: true })
            .get(`/v1/query/${config.get('datasets.viirs_gadm_all_id')}`)
            .query({
                sql: latestQuery
            })
            .reply(200, LATEST_RESPONSE);


        const response = await requester.get(`/api/v2/viirs-active-fires/latest`);

        logger.debug('Response: %s', JSON.stringify(response.body));
        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('object');
        response.body.data.attributes.latest.should.equal('2020-04-26');
    });

    afterEach(async () => {
        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
