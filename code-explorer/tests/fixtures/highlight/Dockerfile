# base
FROM node:22 AS build
RUN npm ci && echo "$HOME"
  env VAR=1
COPY . /app
