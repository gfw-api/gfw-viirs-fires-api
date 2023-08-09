import { Serializer } from 'jsonapi-serializer';

const viirsFiresSerializer: Serializer = new Serializer('viirs-fires', {
    attributes: ['value', 'period', 'downloadUrls', 'area_ha', 'latitude', 'longitude', 'acq_date', 'acq_time', 'day'],
    typeForAttribute: (attribute: string) => attribute,
    downloadUrls: {
        attributes: ['csv', 'geojson', 'kml', 'shp', 'svg']
    },
    keyForAttribute: 'camelCase'
});

const viirsFiresLatestSerializer: Serializer = new Serializer('viirs-latest', {
    attributes: ['date'],
    typeForAttribute: (attribute: string) => attribute,
});

export interface SerializedViirsFiresResponse {
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

class ViirsFiresSerializer {

    static serialize(data: Record<string, any>): SerializedViirsFiresResponse {
        return viirsFiresSerializer.serialize(data);
    }

    static serializeLatest(data: Record<string, any>): SerializedViirsFiresResponse {
        return viirsFiresLatestSerializer.serialize(data);
    }

}

export default ViirsFiresSerializer;
