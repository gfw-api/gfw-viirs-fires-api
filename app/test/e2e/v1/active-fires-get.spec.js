/* eslint-disable no-unused-vars,no-undef */
const nock = require('nock');
const chai = require('chai');
const config = require('config');
const { getTestServer } = require('../utils/test-server');

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


        nock(`https://${config.get('cartoDB.user')}.cartodb.com`)
            .get('/api/v2/sql')
            .query({
                // eslint-disable-next-line max-len
                q: 'with p as (SELECT  the_geom\n           FROM gadm2_countries_simple\n           WHERE iso = UPPER(\'foo\'))\n            SELECT COUNT(pt.*) AS value\n            FROM p\n            inner join vnp14imgtdl_nrt_global_7d pt on ST_Intersects(p.the_geom, pt.the_geom)\n            and\n             (confidence=\'normal\' OR confidence = \'nominal\') AND acq_date >= \'2020-3-8\'::date\n             AND acq_date <= \'2020-3-9\'::date'
            })
            .reply(200, {
                rows: [{ value: 0 }],
                time: 0.002,
                fields: { value: { type: 'number', pgtype: 'int8' } },
                total_rows: 1
            });


        const response = await requester
            .get(`/api/v1/viirs-active-fires/admin/foo`);

        response.status.should.equal(200);
        // eslint-disable-next-line no-unused-expressions
        response.body.should.have.property('data').and.be.null;

    });

    afterEach(async () => {
        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
