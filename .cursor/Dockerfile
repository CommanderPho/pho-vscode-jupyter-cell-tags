# Cloud Agent base image. Do not COPY the project; Cursor clones the
# requested commit and runs `.cursor/install.sh` from the repo root.
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive \
	LANG=C.UTF-8 \
	NODE_VERSION=23.9.0

RUN apt-get update && apt-get install -y --no-install-recommends \
	ca-certificates \
	curl \
	git \
	gnupg \
	sudo \
	unzip \
	xz-utils \
	xvfb \
	libgtk-3-0t64 \
	libnss3 \
	libgbm1 \
	libasound2t64 \
	libatk-bridge2.0-0t64 \
	libdrm2 \
	libxkbcommon0 \
	libxcomposite1 \
	libxdamage1 \
	libxfixes3 \
	libxrandr2 \
	libcups2t64 \
	libx11-xcb1 \
	libxshmfence1 \
	libpango-1.0-0 \
	libcairo2 \
	fonts-liberation \
	xdg-utils \
	&& rm -rf /var/lib/apt/lists/*

# Pin Node to .nvmrc (v23.9.0)
RUN curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" \
	| tar -xJ -C /usr/local --strip-components=1 \
	&& node -v && npm -v

# Ubuntu 24.04 ships Chromium only as a snap, which does not work in this
# image. Google Chrome is the Chromium-based browser used for computer-use.
RUN curl -fsSL https://dl.google.com/linux/linux_signing_key.pub \
	| gpg --dearmor -o /usr/share/keyrings/google-linux.gpg \
	&& echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-linux.gpg] http://dl.google.com/linux/chrome/deb/ stable main" \
	> /etc/apt/sources.list.d/google-chrome.list \
	&& apt-get update \
	&& apt-get install -y --no-install-recommends google-chrome-stable \
	&& rm -rf /var/lib/apt/lists/*

RUN echo 'ubuntu ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/ubuntu \
	&& chmod 0440 /etc/sudoers.d/ubuntu

USER ubuntu
WORKDIR /home/ubuntu
