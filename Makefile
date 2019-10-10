#
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
#

#
# Copyright 2019 Joyent, Inc.
#

#
# Makefile: basic Makefile for template API service
#
# This Makefile is a template for new repos. It contains only repo-specific
# logic and uses included makefiles to supply common targets (javascriptlint,
# jsstyle, restdown, etc.), which are used by other repos as well. You may well
# need to rewrite most of this file, but you shouldn't need to touch the
# included makefiles.
#
# If you find yourself adding support for new targets that could be useful for
# other projects too, you should add these to the original versions of the
# included Makefiles (in eng.git) so that other teams can use them too.
#

#
# Files
#

SHELL :=/bin/bash

CLEAN_FILES += ./node_modules
DOC_FILES	 = index.md
JS_FILES	:= $(shell find lib test bin -name '*.js') \
	bin/cmon-agent bin/collector-collect bin/collector-dump
JSSTYLE_FILES	= $(JS_FILES)
JSSTYLE_FLAGS	= -o indent=4,doxygen,unparenthesized-return=0
ESLINT_FILES	= $(JS_FILES)

# The next line breaks the build due to a variable that eng.git sed expander
# doesn't know about (@@ENABLED@@)
# SMF_MANIFESTS_IN = smf/manifests/cmon-agent.xml.in

# Should be the same version as the platform's /usr/node/bin/node.
NODE_PREBUILT_VERSION =	v4.9.0
NODE_PREBUILT_TAG =	gz
ifeq ($(shell uname -s),SunOS)
NODE_PREBUILT_IMAGE =	18b094b0-eb01-11e5-80c1-175dac7ddf02
endif

# Included definitions
ENGBLD_REQUIRE := $(shell git submodule update --init deps/eng)
include ./deps/eng/tools/mk/Makefile.defs
TOP ?= $(error Unable to access eng.git submodule Makefiles.)

ifeq ($(shell uname -s),SunOS)
	include ./deps/eng/tools/mk/Makefile.node_prebuilt.defs
else
	NPM=npm
	NODE=node
	NPM_EXEC=$(shell which npm)
	NODE_EXEC=$(shell which node)
endif
include ./deps/eng/tools/mk/Makefile.smf.defs

NAME :=	cmon-agent
RELEASE_TARBALL :=	$(NAME)-$(STAMP).tgz
RELEASE_MANIFEST :=	$(NAME)-$(STAMP).manifest
RELSTAGEDIR :=		/tmp/$(NAME)-$(STAMP)
TAPE =		$(TOP)/node_modules/tape/bin/tape

#
# Due to the unfortunate nature of npm, the Node Package Manager, there appears
# to be no way to assemble our dependencies without running the lifecycle
# scripts.  These lifecycle scripts should not be run except in the context of
# an agent installation or uninstallation, so we provide a magic environment
# varible to disable them here.
#
NPM_ENV =		SDC_AGENT_SKIP_LIFECYCLE=yes
RUN_NPM_INSTALL =	$(NPM_ENV) $(NPM) install

CLEAN_FILES += $(NAME)-*.tgz $(NAME)-*.manifest

#
# Repo-specific targets
#
.PHONY: all
all: $(SMF_MANIFESTS) | $(NPM_EXEC) $(REPO_DEPS)
	$(RUN_NPM_INSTALL)

$(TAPE): | $(NPM_EXEC)
	$(RUN_NPM_INSTALL)

.PHONY: test
test:
	./test/runtests

.PHONY: test-coal
COAL=root@10.99.99.7
test-coal:
	ssh $(COAL) /opt/smartdc/agents/lib/node_modules/cmon-agent/test/runtests

.PHONY: release
release: all deps $(SMF_MANIFESTS)
	@echo "Building $(RELEASE_TARBALL)"
	@echo "gonna do something with $(RELSTAGEDIR)/$(NAME)"
	@echo "also gonna do something with $(TOP)"
	@mkdir -p $(RELSTAGEDIR)/$(NAME)

	cd $(TOP) && $(RUN_NPM_INSTALL)
	cp -r \
	    $(TOP)/bin \
	    $(TOP)/build/node \
	    $(TOP)/lib \
	    $(TOP)/node_modules \
	    $(TOP)/npm \
	    $(TOP)/package.json \
	    $(TOP)/smf \
	    $(TOP)/test \
	    $(RELSTAGEDIR)/$(NAME)
	# Trim node
	rm -rf \
	    $(RELSTAGEDIR)/$(NAME)/node/bin/npm \
	    $(RELSTAGEDIR)/$(NAME)/node/lib/node_modules \
	    $(RELSTAGEDIR)/$(NAME)/node/include \
	    $(RELSTAGEDIR)/$(NAME)/node/share
	uuid -v4 >$(RELSTAGEDIR)/cmon-agent/image_uuid
	cd $(RELSTAGEDIR) && $(TAR) -I pigz -cf $(TOP)/$(RELEASE_TARBALL) *
	cat $(TOP)/manifest.tmpl | sed \
	    -e "s/UUID/$$(cat $(RELSTAGEDIR)/cmon-agent/image_uuid)/" \
	    -e "s/NAME/$$(json name < $(TOP)/package.json)/" \
	    -e "s/VERSION/$$(json version < $(TOP)/package.json)/" \
	    -e "s/DESCRIPTION/$$(json description < $(TOP)/package.json)/" \
	    -e "s/BUILDSTAMP/$(STAMP)/" \
	    -e "s/SIZE/$$(stat --printf="%s" $(TOP)/$(RELEASE_TARBALL))/" \
	    -e "s/SHA/$$(openssl sha1 $(TOP)/$(RELEASE_TARBALL) \
	    | cut -d ' ' -f2)/" \
	    > $(TOP)/$(RELEASE_MANIFEST)
	@rm -rf $(RELSTAGEDIR)

.PHONY: publish
publish: release
	mkdir -p $(ENGBLD_BITS_DIR)/$(NAME)
	cp $(TOP)/$(RELEASE_TARBALL) $(ENGBLD_BITS_DIR)/$(NAME)/$(RELEASE_TARBALL)
	cp $(TOP)/$(RELEASE_MANIFEST) $(ENGBLD_BITS_DIR)/$(NAME)/$(RELEASE_MANIFEST)

include ./deps/eng/tools/mk/Makefile.deps
ifeq ($(shell uname -s),SunOS)
    include ./deps/eng/tools/mk/Makefile.node_prebuilt.targ
endif
include ./deps/eng/tools/mk/Makefile.smf.targ
include ./deps/eng/tools/mk/Makefile.targ
