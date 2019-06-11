FROM node:10-alpine
WORKDIR /root
ENV HOME /root
RUN apk add --update --no-cache bash curl g++ gcc git jq make python
RUN npm config set unsafe-perm true
RUN npm install -g lerna nodemon
COPY ops /ops
ENTRYPOINT ["bash", "/ops/permissions-fixer.sh"]
