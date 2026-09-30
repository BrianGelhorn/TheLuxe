FROM node:24-alpine AS build
WORKDIR /app
ARG SOURCE_COMMIT
ENV SOURCE_COMMIT=$SOURCE_COMMIT
COPY index.html styles.css logic.js reports.js dialogs.js inventory.js script.js build.mjs ./
RUN node build.mjs

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/client/ /usr/share/nginx/html/
EXPOSE 8000
