test:
	npx eslint --color --quiet *.js
	node --trace-deprecation --throw-deprecation test.js

publish:
	git push -u --tags origin master
	npm publish

deps:
	rm -rf node_modules
	npm i

update:
	node updates.js -u
	$(MAKE) deps

patch:
	$(MAKE) test
	npx ver patch
	$(MAKE) publish

minor:
	$(MAKE) test
	npx ver minor
	$(MAKE) publish

major:
	$(MAKE) test
	npx ver major
	$(MAKE) publish

.PHONY: test publish deps update patch minor major
