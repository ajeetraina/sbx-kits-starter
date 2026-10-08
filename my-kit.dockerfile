# syntax=docker/dockerfile:1
#
# Content recipe for the my-kit mixin. A mixin's layers are an OVERLAY that
# lands on a workload you've never seen: stage everything under /out in a build
# stage, then COPY it into scratch. This replaces v2's setup.install steps.
#
# A pip package can only travel in an overlay if its interpreter travels with
# it. `uv tool install --managed-python` downloads a standalone CPython into the
# tree we copy, so bin/python resolves inside the overlay and the kit works even
# on a base with no python at all. (The other option is a create-time hook via
# the lifecycle@1 capability; this portable form is the simpler default.)

FROM dhi.io/debian-base:trixie-dev AS build
ARG PKG_VERSION

USER root
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH=/root/.local/bin:${PATH}

RUN set -eux; \
    # Keep everything under /opt so it's self-contained and out of the agent's
    # home; put launchers on PATH in /usr/local/bin.
    export UV_TOOL_DIR=/out/opt/my-kit/tools \
           UV_PYTHON_INSTALL_DIR=/out/opt/my-kit/python \
           UV_TOOL_BIN_DIR=/out/usr/local/bin; \
    uv tool install --managed-python --python 3.14 \
      "<your-package>==${PKG_VERSION}"; \
    # The pin is a claim about content: make the build enforce it.
    /out/usr/local/bin/<your-cli> --version | grep -q "${PKG_VERSION}"; \
    # Normalize any foreign uids a PyPI tarball preserved (publisher's machine).
    chown -R 0:0 /out

# Inject content (v2's files/home/ tree). An overlay's directory entries
# override the base's, so the chown must START at the agent's home: too shallow
# and /home ends up owned by the agent; one level too deep and /home/agent stays
# root. Numeric ids because scratch has no /etc/passwd. Uncomment to use.
# COPY files/home/ /out/home/agent/
# RUN chown -R 1000:1000 /out/home/agent

# The overlay: lands on any base. scratch carries no files of its own.
FROM scratch
COPY --from=build /out /

# v2 environment.variables -> ENV on the FINAL stage (a build stage's config is
# discarded). A mixin's env merges into the composed image and reaches the agent
# process. Keep keys to ones this tool owns; PATH is appended, not replaced.
ENV EXAMPLE_SETTING=value
ENV PATH=/usr/local/bin:${PATH}
