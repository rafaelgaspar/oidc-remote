# syntax=docker/dockerfile:1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e
FROM debian:forky@sha256:716a7ceeaf1557c357a3c484839176dab750fbda0c5d0530dbbb18f94ccf826b AS node

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
  && curl -fsSL --retry 5 --retry-delay 5 https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /usr/share/keyrings/nodesource.gpg \
  && echo "deb [signed-by=/usr/share/keyrings/nodesource.gpg] https://deb.nodesource.com/node_26.x nodistro main" > /etc/apt/sources.list.d/nodesource.list \
  && printf '%s\n' 'Package: nodejs' 'Pin: origin deb.nodesource.com' 'Pin-Priority: 1001' > /etc/apt/preferences.d/nodesource \
  && apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" \
  && apt-get install -y --no-install-recommends nodejs tini \
  && apt-get purge -y --auto-remove curl gnupg \
  && rm -rf /var/lib/apt/lists/*

FROM node AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev && chmod +x dist/cli.js

FROM node

# Runtime never invokes npm/npx — drop them so their bundled deps
# don't show up as vulnerabilities in this image.
RUN rm -rf /usr/lib/node_modules/npm /usr/lib/node_modules/corepack /usr/bin/npm /usr/bin/npx /usr/bin/corepack \
  && useradd --uid 1000 --user-group --no-create-home --shell /usr/sbin/nologin oidc-remote

WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY package.json ./
# Symlinked bin, same layout as npm/npx installs.
RUN ln -s /app/dist/cli.js /usr/local/bin/oidc-remote

USER 1000:1000

# tini as PID 1: node ignores SIGTERM when it is PID 1 and oidc-remote installs no handler.
ENTRYPOINT ["tini", "--", "oidc-remote"]
