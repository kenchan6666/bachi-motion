# Production image for the bachi-motion web app: a static site
# (index.html + js/ + assets/ + original practice samples/).
#
# CLI export (render.js + headless Chrome / puppeteer-core) is intentionally
# not included. That path stays a local developer tool; the in-browser app
# does not need a Node server.
#
# Build:  docker build -t bachi-motion:local .
# Run:    docker run --rm -p 8080:8080 bachi-motion:local
# Sub-path (e.g. https://kenchan0522.blog/taiko/): have the outer proxy
# strip the prefix and forward to this container's port 8080. Asset URLs
# are relative, so no app change is required.

FROM nginx:1.27-alpine

RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/default.conf

COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY index.html /usr/share/nginx/html/index.html
COPY js/ /usr/share/nginx/html/js/
COPY assets/ /usr/share/nginx/html/assets/
COPY samples/ /usr/share/nginx/html/samples/

RUN chown -R nginx:nginx /usr/share/nginx/html \
    && chmod -R a+rX /usr/share/nginx/html

USER nginx
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
