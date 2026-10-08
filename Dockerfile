ARG ALPINE_VERSION=3.24.2

FROM alpine:${ALPINE_VERSION} AS build
RUN apk add --no-cache build-base cmake samurai pkgconf linux-headers curl-dev openssl-dev libpsl-dev
WORKDIR /src
COPY . .
# Shown as "4.1.3 (<VERSION>)" by the daemon; cmake keeps ten characters of it.
ARG VERSION=dev
# Parallel compile and test jobs; empty means every core.
ARG BUILD_JOBS=""
RUN echo "${VERSION}" > REVISION \
    && cmake -S . -B /build -G Ninja \
       -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX=/usr \
       -DENABLE_DAEMON=ON -DENABLE_UTILS=ON -DENABLE_TESTS=ON \
       -DENABLE_CLI=OFF -DENABLE_GTK=OFF -DENABLE_QT=OFF -DENABLE_MAC=OFF \
       -DENABLE_NLS=OFF -DINSTALL_DOC=OFF -DINSTALL_WEB=ON -DREBUILD_WEB=OFF \
       -DRUN_CLANG_TIDY=OFF -DWITH_CRYPTO=openssl -DWITH_SYSTEMD=OFF \
       -DUSE_SYSTEM_EVENT2=OFF -DUSE_SYSTEM_DEFLATE=OFF -DUSE_SYSTEM_DHT=OFF \
       -DUSE_SYSTEM_MINIUPNPC=OFF -DUSE_SYSTEM_NATPMP=OFF -DUSE_SYSTEM_UTP=OFF \
       -DUSE_SYSTEM_B64=OFF -DUSE_SYSTEM_PSL=ON \
    && cmake --build /build ${BUILD_JOBS:+-j "$BUILD_JOBS"}
# A failed test fails the image; the retry is for the timing-sensitive ones.
RUN ctest --test-dir /build -j "${BUILD_JOBS:-$(nproc)}" --output-on-failure --repeat until-pass:2
RUN DESTDIR=/out cmake --install /build --strip

FROM alpine:${ALPINE_VERSION}
# Name, uid and gid of Debian's transmission-daemon package: the config volume belongs to them.
RUN apk add --no-cache libcurl libpsl libstdc++ ca-certificates \
    && addgroup -S -g 101 debian-transmission \
    && adduser -S -D -H -u 100 -G debian-transmission -h /var/lib/transmission-daemon \
       -s /sbin/nologin debian-transmission \
    && install -d -o debian-transmission -g debian-transmission \
       /etc/transmission-daemon /var/lib/transmission-daemon
COPY --from=build /out/ /
EXPOSE 9091
USER debian-transmission
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD nc -z 127.0.0.1 9091 || exit 1
ENTRYPOINT ["/usr/bin/transmission-daemon"]
CMD ["-f", "--log-level=info", "-g", "/etc/transmission-daemon"]
