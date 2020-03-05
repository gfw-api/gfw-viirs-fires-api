/* eslint-disable no-unused-vars,no-undef */
const nock = require('nock');
const chai = require('chai');
const config = require('config');
const axios = require('axios');
const { getTestServer } = require('../utils/test-server');
const { CORRECT_CAMERRON_SQL_RESULT } = require('../utils/cameroon-mock');

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

    // TODO: should probably return a 404
    it('Get admin level data for an area that doesn\'t exist returns a 200 with no data', async () => {
        nock(process.env.CT_URL)
            .get('/v1/geostore/admin/foo')
            .reply(404, { errors: [{ status: 404, detail: 'Country not found' }] });


        nock(`https://${config.get('cartoDB.user')}.cartodb.com`, { encodedQueryParams: true })
            .get(`/api/v2/sql?q=with%20p%20as%20%28SELECT%20%20the_geom%0A%20%20%20%20%20%20%20%20%20%20%20FROM%20gadm2_countries_simple%0A%20%20%20%20%20%20%20%20%20%20%20WHERE%20iso%20%3D%20UPPER%28%27foo%27%29%29%0A%20%20%20%20%20%20%20%20%20%20%20%20SELECT%20COUNT%28pt.%2A%29%20AS%20value%0A%20%20%20%20%20%20%20%20%20%20%20%20FROM%20p%0A%20%20%20%20%20%20%20%20%20%20%20%20inner%20join%20vnp14imgtdl_nrt_global_7d%20pt%20on%20ST_Intersects%28p.the_geom%2C%20pt.the_geom%29%0A%20%20%20%20%20%20%20%20%20%20%20%20and%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%28confidence%3D%27normal%27%20OR%20confidence%20%3D%20%27nominal%27%29%20AND%20acq_date%20%3E%3D%20%272020-03-04%27%3A%3Adate%0A%20%20%20%20%20%20%20%20%20%20%20%20%20AND%20acq_date%20%3C%3D%20%272020-03-05%27%3A%3Adate`)
            .reply(200, {
                rows: [{ value: 0 }],
                time: 0.002,
                fields: { value: { type: 'number', pgtype: 'int8' } },
                total_rows: 1
            });

        const response = await requester
            .get(`/api/v1/viirs-active-fires/admin/foo?period=2020-03-04%2C2020-03-05`);

        response.status.should.equal(200);
        // eslint-disable-next-line no-unused-expressions
        response.body.should.have.property('data').and.be.null;

    });

    it('Get correct downloadUrls (200) links when when querying for admin level data', async () => {
        nock('https://wri-01.cartodb.com', { encodedQueryParams: true })
            .get(`/api/v2/sql?q=with%20p%20as%20%28SELECT%20iso%2C%20area_ha%2C%20ST_makevalid%28ST_Simplify%28the_geom%2C%200.005%29%29%20AS%20the_geom%0A%20%20%20%20%20%20%20%20%20%20%20FROM%20gadm36_countries%0A%20%20%20%20%20%20%20%20%20%20%20WHERE%20iso%20%3D%20UPPER%28%27CMR%27%29%29%0A%20%20%20%20%20%20%20%20%20%20%20%20SELECT%20COUNT%28pt.%2A%29%20AS%20value%2C%20area_ha%0A%20%20%20%20%20%20%20%20%20%20%20%20FROM%20p%0A%20%20%20%20%20%20%20%20%20%20%20%20inner%20join%20vnp14imgtdl_nrt_global_7d%20pt%20on%20ST_Intersects%28p.the_geom%2C%20pt.the_geom%29%0A%20%20%20%20%20%20%20%20%20%20%20%20and%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%28confidence%3D%27normal%27%20OR%20confidence%20%3D%20%27nominal%27%29%20AND%20acq_date%20%3E%3D%20%272020-03-04%27%3A%3Adate%0A%20%20%20%20%20%20%20%20%20%20%20%20%20AND%20acq_date%20%3C%3D%20%272020-03-05%27%3A%3Adate%0A%20%20%20%20%20%20%20%20%20%20%20%20%20GROUP%20BY%20area_ha%2C%20iso%2C%20pt.cartodb_id`)
            .reply(200, CORRECT_CAMERRON_SQL_RESULT);

        nock('https://wri-01.cartodb.com', { encodedQueryParams: true })
            .get('/api/v2/sql?q=select%20area_ha%20FROM%20gadm36_countries%20WHERE%20gid_0%20%3D%20%27CMR%27')
            .reply(200, {
                rows: [
                    {
                        area_ha: 46604003.7680844
                    }
                ],
                time: 0.001,
                fields: {
                    area_ha: {
                        type: 'number',
                        pgtype: 'float8'
                    }
                },
                total_rows: 1
            });

        const response = await requester.get(`/api/v2/viirs-active-fires/admin/CMR?period=2020-03-04%2C2020-03-05`);

        const { downloadUrls } = response.body.data.attributes;

        response.status.should.equal(200);
        response.body.should.have.property('data').and.be.an('object');
        response.body.data.attributes.should.have.property('downloadUrls').and.be.an('object');
        downloadUrls.should.have.property('csv');
        downloadUrls.should.have.property('json');
        downloadUrls.should.have.property('kml');
        downloadUrls.should.have.property('shp');
        downloadUrls.should.have.property('svg');

        try {
            const csvDownloadUrl = await axios.get(downloadUrls.csv);
            csvDownloadUrl.status.should.equal(200);

            const jsonDownloadUrl = await axios.get(downloadUrls.json);
            jsonDownloadUrl.status.should.equal(200);

            const kmlDownloadUrl = await axios.get(downloadUrls.kml);
            kmlDownloadUrl.status.should.equal(200);

            const shpDownloadUrl = await axios.get(downloadUrls.shp);
            shpDownloadUrl.status.should.equal(200);

            const svgDownloadUrl = await axios.get(downloadUrls.svg);
            svgDownloadUrl.status.should.equal(200);
        } catch (error) {
            throw new Error('Something awful happend', error);
        }
    });

    afterEach(async () => {
        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
