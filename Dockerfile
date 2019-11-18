# base image
FROM node:10

# set working directory
WORKDIR /usr/src/app

# Copy package.json, package-lock.json and install app dependencies
# This is done before copying the actual app files to allow Docker to cache
# this stage and avoid reinstalling dependencies when only app files change
COPY package.json ./

RUN npm install

EXPOSE 8080

# Bundle app source
COPY . .
