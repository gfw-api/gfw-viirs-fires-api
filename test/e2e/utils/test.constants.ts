import { ApplicationValidationResponse } from "rw-api-microservice-node/dist/types";

export interface IRequestUser {
    id: string;
    role?: string;
    extraUserData?: Record<string, any>;
    name?: string;
    provider?: string;
    email?: string;
}

export const USERS: Record<string, IRequestUser> = {
    USER: {
        id: '1a10d7c6e0a37126611fd7a5',
        name: 'test user',
        role: 'USER',
        provider: 'local',
        email: 'user@control-tower.org',
        extraUserData: {
            apps: [
                'rw',
                'gfw',
                'gfw-climate',
                'prep',
                'aqueduct',
                'forest-atlas',
                'data4sdgs'
            ]
        }
    },
    MANAGER: {
        id: '1a10d7c6e0a37126611fd7a6',
        name: 'test manager',
        role: 'MANAGER',
        provider: 'local',
        email: 'user@control-tower.org',
        extraUserData: {
            apps: [
                'rw',
                'gfw',
                'gfw-climate',
                'prep',
                'aqueduct',
                'forest-atlas',
                'data4sdgs'
            ]
        }
    },
    ADMIN: {
        id: '1a10d7c6e0a37126611fd7a7',
        name: 'test admin',
        role: 'ADMIN',
        provider: 'local',
        email: 'user@control-tower.org',
        extraUserData: {
            apps: [
                'rw',
                'gfw',
                'gfw-climate',
                'prep',
                'aqueduct',
                'forest-atlas',
                'data4sdgs'
            ]
        }
    },
    SUPERADMIN: {
        id: '1a10d7c6e0a37126601fd7a6',
        role: 'SUPERADMIN',
        provider: 'local',
        email: 'user@control-tower.org',
        name: 'test super admin',
        extraUserData: {
            apps: [
                'rw',
                'gfw',
                'gfw-climate',
                'prep',
                'aqueduct',
                'forest-atlas',
                'data4sdgs'
            ]
        }
    },
    RW_USER: {
        id: '2a10d7c6e0a37126611fd7a5',
        role: 'USER',
        provider: 'local',
        email: 'user@control-tower.org',
        name: 'RW User',
        extraUserData: { apps: ['rw'] }
    },
    RW_MANAGER: {
        id: '2a10d7c6e0a37126611fd7a6',
        role: 'MANAGER',
        provider: 'local',
        email: 'manager@control-tower.org',
        name: 'RW Manager',
        extraUserData: { apps: ['rw'] }
    },
    RW_ADMIN: {
        id: '2a10d7c6e0a37123311fd7a7',
        role: 'ADMIN',
        provider: 'local',
        email: 'admin@control-tower.org',
        name: 'RW Admin',
        extraUserData: { apps: ['rw'] }
    },
    MICROSERVICE: {
        id: 'microservice'
    }
};

export const APPLICATION: ApplicationValidationResponse = {
    data: {
        type: 'applications',
        id: '649c4b204967792f3a4e52c9',
        attributes: {
            name: 'grouchy-armpit',
            organization: null,
            user: null,
            apiKeyValue: 'a1a9e4c3-bdff-4b6b-b5ff-7a60a0454e13',
            createdAt: '2023-06-28T15:00:48.149Z',
            updatedAt: '2023-06-28T15:00:48.149Z'
        }
    }
};
