import { init } from 'app';
import logger from 'logger';

init().then(
    () => {
        logger.info('Server running');
    },
    (err: any) => {
        logger.error('Error running server', err);
    },
);
