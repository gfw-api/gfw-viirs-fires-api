/* eslint-disable max-len */
const USERS = {
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

module.exports = {
    USERS
};
