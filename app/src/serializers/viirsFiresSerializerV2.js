const JSONAPISerializer = require('jsonapi-serializer').Serializer;

const viirsFiresSerializerV2 = new JSONAPISerializer('viirs-active-fires', {
    attributes: ['value', 'period', 'downloadUrls', 'area_ha', 'latitude', 'longitude', 'acq_date', 'acq_time', 'day'],
    typeForAttribute(attribute) {
        return attribute;
    },
    downloadUrls: {
        attributes: ['csv', 'json', 'kml', 'shp', 'svg']
    },
    keyForAttribute: 'camelCase'
});

const viirsFiresLatestSerializer = new JSONAPISerializer('viirs-latest', {
    attributes: ['latest'],
    typeForAttribute(attribute) {
        return attribute;
    }
});

class ViirsFiresSerializerV2 {

    static serialize(data) {
        return viirsFiresSerializerV2.serialize(data);
    }

    static serializeLatest(data) {
        return viirsFiresLatestSerializer.serialize(data);
    }

}

module.exports = ViirsFiresSerializerV2;
