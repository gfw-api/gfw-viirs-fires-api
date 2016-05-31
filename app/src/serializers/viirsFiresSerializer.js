'use strict';

var logger = require('logger');
var JSONAPISerializer = require('jsonapi-serializer').Serializer;
var viirsFiresSerializer = new JSONAPISerializer('viirs-fires', {
    attributes: ['value', 'period', 'downloadUrls'],
    typeForAttribute: function (attribute, record) {
        return attribute;
    },
    downloadUrls:{
        attributes: ['csv', 'geojson', 'kml', 'shp', 'svg']
    }
});

var viirsFiresLatestSerializer = new JSONAPISerializer('viirs-latest', {
    attributes: ['date'],
    typeForAttribute: function (attribute, record) {
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
