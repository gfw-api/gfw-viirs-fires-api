import chai from 'chai';
import ChaiHttp from 'chai-http';
import { mockCloudWatchSetupRequestsSequence } from "rw-api-microservice-node/dist/test-mocks";
import config from "config";

let requester: ChaiHttp.Agent;

chai.use(ChaiHttp);

export const getTestServer: () => Promise<ChaiHttp.Agent> = async () => {
    if (requester) {
        return requester;
    }

    mockCloudWatchSetupRequestsSequence({
        awsRegion: process.env.AWS_REGION,
        logGroupName: process.env.CLOUDWATCH_LOG_GROUP_NAME,
        logStreamName: config.get('service.name')
    });

    const { init } = await import('app');
    const { server } = await init();

    requester = chai.request.agent(server);

    return requester;
};

export const closeTestServer: () => Promise<void> = async () => {
    if (!requester) {
        return;
    }
    requester.close();

    requester = null;
};
