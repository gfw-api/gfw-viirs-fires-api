'use strict';

var logger = require('logger');
var JSONAPISerializer = require('jsonapi-serializer').Serializer;
var viirsFiresSerializerV2 = new JSONAPISerializer('viirs-active-fires', {
    attributes: ['value', 'period', 'downloadUrls', 'area_ha', 'latitude', 'longitude', 'acq_date', 'acq_time', 'day'],
    typeForAttribute: function (attribute, record) {
        return attribute;
    },
    downloadUrls:{
        attributes: ['csv', 'json', 'kml', 'shp', 'svg']
    },
    keyForAttribute: 'camelCase'
});

var viirsFiresLatestSerializer = new JSONAPISerializer('viirs-latest', {
    attributes: ['latest'],
    typeForAttribute: function (attribute, record) {
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
