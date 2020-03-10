const JSONAPISerializer = require('jsonapi-serializer').Serializer;

const viirsFiresSerializer = new JSONAPISerializer('viirs-fires', {
    attributes: ['value', 'period', 'downloadUrls', 'area_ha', 'latitude', 'longitude', 'acq_date', 'acq_time', 'day'],
    typeForAttribute(attribute) {
        return attribute;
    },
    downloadUrls: {
        attributes: ['csv', 'geojson', 'kml', 'shp', 'svg']
    },
    keyForAttribute: 'camelCase'
});

const viirsFiresLatestSerializer = new JSONAPISerializer('viirs-latest', {
    attributes: ['date'],
    typeForAttribute(attribute) {
        return attribute;
    }
});

class ViirsFiresSerializer {

    static serialize(data) {
        return viirsFiresSerializer.serialize(data);
    }

    static serializeLatest(data) {
        return viirsFiresLatestSerializer.serialize(data);
    }

}

module.exports = ViirsFiresSerializer;
