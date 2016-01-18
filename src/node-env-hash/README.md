We aggressively cache path resolution of external packages, but, as always, cache
invalidation is a pain. To resolve if our cached data is still valid, we need a
way to uniquely identify the state of the dependency tree.

The most accurate, but slowest, method would be to crawl node_modules and generate
a hash from the file tree. This would work well on small codebases, but more typical
dependency trees will introduce multiple seconds of overhead as the tree is crawled.
Non-blocking IO would help to prevent blocking the event loop, but crawling the file
tree will still consume most of libuv's thread pool.

A similarly, but slightly more performant approach is to use the same mechanism that
NPM uses to walk the tree, eg: recursively read the package.json, then look in
node_modules for more modules, etc. This still has a fair measure of IO overhead
though. It also requires you to introspect each package's package.json in some fashion,
either hashing the contents, reading the version, or just stating the file.

The simplest - and most performant - solution would be to treat the package.json
as a canonical indicator. However, in practice this falls apart as NPM will install
packages that are semantic version compatible, but that may not match the exact
versions specified in package.json. Additionally, as NPM 3 builds the dependency
tree non-deterministically, the state of the node_modules tree can't be relied
upon without interrogating it.

A performant approach that maintains some accuracy is to do a shallow crawl of the
node_modules' contents, and then build a hash from each directory's names and mtimes.
The downside to this approach, is that it doesn't provide too much clarity when
flattened dependencies are moved around in the tree. Though, in practice, this
doesn't seem to be too much of an issue.

Mindful of both performance and accuracy requirements, we combine the package.json
and shallow crawl approaches to produce a single hash which is then used to namespace
cached data. This approach does add a few milliseconds of IO overhead, but seems to
work well enough with regards to detecting changes to an environment.