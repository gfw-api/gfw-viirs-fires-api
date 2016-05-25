'use strict';

var logger = require('logger');
var JSONAPISerializer = require('jsonapi-serializer').Serializer;
var viirsFiresSerializer = new JSONAPISerializer('viirs-fires', {
    attributes: ['value'],
    typeForAttribute: function (attribute, record) {
        return attribute;
    },
    keyForAttribute: 'camelCase'
});

class ViirsFiresSerializer {

  static serialize(data) {
    return viirsFiresSerializer.serialize(data);
  }
}

module.exports = ViirsFiresSerializer;
