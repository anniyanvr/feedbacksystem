FROM bash:4.4
MAINTAINER Benjamin Manns <benjamin.manns@mni.thm.de>
RUN apk add --no-cache php
RUN apk add --no-cache php-json
RUN apk add --no-cache php7-pecl-mcrypt
RUN apk add --no-cache build-base
RUN apk add --no-cache flex
COPY similarity-tester-master /opt/sim
WORKDIR /opt/sim
RUN make binaries
WORKDIR /root
CMD ['sh']
