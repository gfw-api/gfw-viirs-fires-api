FROM node:12-alpine
MAINTAINER info@vizzuality.com

ENV NAME gfw-viirs-fires-api
ENV USER microservice

RUN apk update && apk upgrade && \
    apk add --no-cache --update bash git openssh python build-base curl

RUN addgroup $USER && adduser -s /bin/bash -D -G $USER $USER

RUN yarn global add grunt-cli bunyan

RUN mkdir -p /opt/$NAME
COPY package.json /opt/$NAME/package.json
COPY yarn.lock /opt/$NAME/yarn.lock
RUN cd /opt/$NAME && yarn


COPY entrypoint.sh /opt/$NAME/entrypoint.sh
COPY config /opt/$NAME/config

WORKDIR /opt/$NAME

COPY ./app /opt/$NAME/app
RUN chown -R $USER:$USER /opt/$NAME

# Tell Docker we are going to use this ports
EXPOSE 3600
USER $USER

ENTRYPOINT ["./entrypoint.sh"]
