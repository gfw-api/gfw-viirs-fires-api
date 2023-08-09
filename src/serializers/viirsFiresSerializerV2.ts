import { Serializer } from 'jsonapi-serializer';

const viirsFiresSerializerV2: Serializer = new Serializer('viirs-active-fires', {
    attributes: ['value', 'period', 'downloadUrls', 'area_ha', 'latitude', 'longitude', 'acq_date', 'acq_time', 'day'],
    typeForAttribute: (attribute: string) => attribute,
    downloadUrls: {
        attributes: ['csv', 'json', 'kml', 'shp', 'svg']
    },
    keyForAttribute: 'camelCase'
});

const viirsFiresLatestSerializer: Serializer = new Serializer('viirs-latest', {
    attributes: ['latest'],
    typeForAttribute: (attribute: string) => attribute,
});

export interface SerializedViirsFiresV2Response {
    data: Record<string, any>,
    links: {
        self: string,
        first: string,
        last: string,
        prev: string,
        next: string,
    },
    meta: {
        'total-pages': number,
        'total-items': number
        size: number
    }
}

class ViirsFiresSerializerV2 {

    static serialize(data: Record<string, any>): SerializedViirsFiresV2Response {
        return viirsFiresSerializerV2.serialize(data);
    }

    static serializeLatest(data: Record<string, any>): SerializedViirsFiresV2Response {
        return viirsFiresLatestSerializer.serialize(data);
    }

}

export default ViirsFiresSerializerV2;
