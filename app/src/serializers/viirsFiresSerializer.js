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

class ViirsFiresSerializer {

  static serialize(data) {
    return viirsFiresSerializer.serialize(data);
  }
}

module.exports = ViirsFiresSerializer;
